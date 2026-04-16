/**
 * CRON ENDPOINTS
 * Protected endpoints for triggering sync jobs manually or via external scheduler.
 * Authentication: x-cron-secret header must match CRON_SECRET env var.
 */

import { Router, Request, Response } from 'express';
import { config } from '../config.js';
import { syncMotiveDaily } from '../telematics/motive/syncService.js';
import { syncSamsaraDaily } from '../telematics/samsara/syncService.js';
import { syncWhiparoundDaily } from '../integrations/whiparound/syncService.js';
import { refreshDieselPrice } from '../lib/eiaFuelPrice.js';
import { getAppPrisma } from '../lib/prisma.js';
import { cacheDelPattern } from '../lib/redis.js';
import { recordTelematicsCronRun } from '../lib/telematicsCronRun.js';
import { CronJobType } from '../generated/app-client/index.js';

const router = Router();

/** Shared secret guard for all cron endpoints */
function verifyCronSecret(req: Request, res: Response): boolean {
  const token = req.headers['x-cron-secret'];
  const expected = config.cronSecret;

  if (!expected) {
    res.status(500).json({ error: 'Server configuration error', message: 'CRON_SECRET not set' });
    return false;
  }
  if (token !== expected) {
    console.warn(`Unauthorized cron attempt from ${req.ip}`);
    res.status(401).json({ error: 'Unauthorized', message: 'Invalid cron secret' });
    return false;
  }
  return true;
}

/**
 * POST /cron/sync-motive
 * Runs the Motive daily sync synchronously and returns the full result.
 */
router.post('/sync-motive', async (req: Request, res: Response) => {
  if (!verifyCronSecret(req, res)) return;
  try {
    console.log(`\n✅ Authorized Motive cron request from ${req.ip}`);
    const result = await syncMotiveDaily();
    await recordTelematicsCronRun(CronJobType.MOTIVE_DAILY, {
      totalOrgs: result.totalOrgs,
      successCount: result.successCount,
      errorCount: result.errorCount,
      duration: result.duration,
      results: result.results as any,
    });
    await Promise.all([
      cacheDelPattern('prod:telematics:*'),
      cacheDelPattern('prod:fleet:*'),
    ]);
    const allSucceeded = result.errorCount === 0;
    res.status(allSucceeded ? 200 : 207).json({
      success: allSucceeded,
      totalOrgs: result.totalOrgs,
      successCount: result.successCount,
      errorCount: result.errorCount,
      durationMs: result.duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Motive cron error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

/**
 * POST /cron/sync-samsara
 * Runs the Samsara daily sync synchronously and returns the full result.
 */
router.post('/sync-samsara', async (req: Request, res: Response) => {
  if (!verifyCronSecret(req, res)) return;
  try {
    console.log(`\n✅ Authorized Samsara cron request from ${req.ip}`);
    const result = await syncSamsaraDaily();
    await recordTelematicsCronRun(CronJobType.SAMSARA_DAILY, {
      totalOrgs: result.totalOrgs,
      successCount: result.successCount,
      errorCount: result.errorCount,
      duration: result.duration,
      results: result.results as any,
    });
    await Promise.all([
      cacheDelPattern('prod:telematics:*'),
      cacheDelPattern('prod:fleet:*'),
    ]);
    const allSucceeded = result.errorCount === 0;
    res.status(allSucceeded ? 200 : 207).json({
      success: allSucceeded,
      totalOrgs: result.totalOrgs,
      successCount: result.successCount,
      errorCount: result.errorCount,
      durationMs: result.duration,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Samsara cron error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

/**
 * POST /cron/sync-whiparound
 * Runs the Whip Around daily sync and returns the full result.
 */
router.post('/sync-whiparound', async (req: Request, res: Response) => {
  if (!verifyCronSecret(req, res)) return;
  try {
    console.log(`\n✅ Authorized Whip Around cron request from ${req.ip}`);
    const result = await syncWhiparoundDaily();
    const allSucceeded = result.errorCount === 0;
    res.status(allSucceeded ? 200 : 207).json({
      success: allSucceeded,
      totalOrgs: result.totalOrgs,
      successCount: result.successCount,
      errorCount: result.errorCount,
      durationMs: result.duration,
      timestamp: new Date().toISOString(),
      results: result.results,
    });
  } catch (error: any) {
    console.error('Whip Around cron error:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

/**
 * POST /cron/refresh-fuel-price
 * Fetches the latest diesel retail price from EIA and stores in system_config.
 * Should be called once per week (e.g. Monday morning).
 */
router.post('/refresh-fuel-price', async (req: Request, res: Response) => {
  if (!verifyCronSecret(req, res)) return;
  try {
    const result = await refreshDieselPrice();
    res.json({ success: true, ...result, timestamp: new Date().toISOString() });
  } catch (error: any) {
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

/**
 * GET /cron/status
 * Returns lastSyncAt, lastError, status, and lastSyncAgeHours for all provider accounts.
 * A stale flag is set if the last sync was >26h ago.
 */
router.get('/status', async (req: Request, res: Response) => {
  if (!verifyCronSecret(req, res)) return;
  try {
    const appClient = getAppPrisma();
    const accounts = await appClient.telematicsProviderAccount.findMany({
      select: {
        clerkOrgId: true,
        provider: true,
        status: true,
        lastSyncAt: true,
        lastError: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    const now = Date.now();
    const enriched = accounts.map((a) => {
      const lastSyncAgeHours =
        a.lastSyncAt != null
          ? Math.round(((now - a.lastSyncAt.getTime()) / 3600000) * 10) / 10
          : null;
      return {
        ...a,
        lastSyncAgeHours,
        stale: lastSyncAgeHours === null || lastSyncAgeHours > 26,
      };
    });

    res.json({
      timestamp: new Date().toISOString(),
      total: enriched.length,
      active: enriched.filter((a) => a.status === 'ACTIVE').length,
      error: enriched.filter((a) => a.status === 'ERROR').length,
      staleCount: enriched.filter((a) => a.stale).length,
      accounts: enriched,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

/**
 * GET /cron/data-integrity
 * Returns row counts per table per org for the last 7 days.
 * Use this to confirm that data is flowing correctly post-sync.
 */
router.get('/data-integrity', async (req: Request, res: Response) => {
  if (!verifyCronSecret(req, res)) return;
  try {
    const appClient = getAppPrisma();

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

    // Count rows per org per table for the last 7 days
    const [samsaraUtil, samsaraIdling, samsaraSafety, motiveUtil, motiveIdle, motiveScorecard] =
      await Promise.all([
        appClient.samsaraVehicleUtilization.groupBy({
          by: ['clerkOrgId'],
          where: { date: { gte: sevenDaysAgoStr } },
          _count: { id: true },
        }),
        appClient.samsaraIdlingEvent.groupBy({
          by: ['clerkOrgId'],
          where: { eventDate: { gte: sevenDaysAgoStr } },
          _count: { id: true },
        }),
        appClient.samsaraSafetyEvent.groupBy({
          by: ['clerkOrgId'],
          where: { eventDate: { gte: sevenDaysAgoStr } },
          _count: { id: true },
        }),
        appClient.motiveVehicleUtilization.groupBy({
          by: ['clerkOrgId'],
          where: { date: { gte: sevenDaysAgoStr } },
          _count: { id: true },
        }),
        appClient.motiveIdleEvent.groupBy({
          by: ['clerkOrgId'],
          where: { date: { gte: sevenDaysAgoStr } },
          _count: { id: true },
        }),
        appClient.motiveScorecardSummary.groupBy({
          by: ['clerkOrgId'],
          where: { date: { gte: sevenDaysAgoStr } },
          _count: { id: true },
        }),
      ]);

    const toMap = (rows: Array<{ clerkOrgId: string; _count: { id: number } }>) =>
      Object.fromEntries(rows.map((r) => [r.clerkOrgId, r._count.id]));

    res.json({
      timestamp: new Date().toISOString(),
      window: `${sevenDaysAgoStr} to today`,
      tables: {
        samsara_vehicle_utilization: toMap(samsaraUtil),
        samsara_idling_events: toMap(samsaraIdling),
        samsara_safety_events: toMap(samsaraSafety),
        motive_vehicle_utilization: toMap(motiveUtil),
        motive_idle_events: toMap(motiveIdle),
        motive_scorecard_summaries: toMap(motiveScorecard),
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

/**
 * GET /cron/health — public health check for the cron endpoints
 */
router.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'cron-endpoints' });
});

export default router;
