/**
 * CRON ENDPOINTS
 * Protected endpoints for triggering sync jobs manually or via external scheduler.
 * Authentication: x-cron-secret header must match CRON_SECRET env var.
 */

import { Router, Request, Response } from 'express';
import { config } from '../config.js';
import { syncMotiveDaily } from '../telematics/motive/syncService.js';
import { syncSamsaraDaily } from '../telematics/samsara/syncService.js';
import { getAppPrisma } from '../lib/prisma.js';

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
 * GET /cron/status
 * Returns lastSyncAt, lastError, and status for all active provider accounts.
 * Protected by cron secret so it can be called by the scheduler to verify health.
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

    res.json({
      timestamp: new Date().toISOString(),
      total: accounts.length,
      active: accounts.filter((a) => a.status === 'ACTIVE').length,
      error: accounts.filter((a) => a.status === 'ERROR').length,
      accounts,
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
