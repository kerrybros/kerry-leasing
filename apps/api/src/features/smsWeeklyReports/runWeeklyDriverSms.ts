/**
 * Top-level cron entry: fans out the weekly SMS send across every enabled
 * customer whose configured send hour matches the current ET hour.
 *
 * Returns a DailySyncSummary so it can be persisted via recordTelematicsCronRun
 * with CronJobType.SMS_WEEKLY_DRIVER_REPORT — same admin-debug shape as the
 * Motive/Samsara syncs.
 */

import { getAppPrisma } from '../../lib/prisma.js';
import { cacheDelPattern } from '../../lib/redis.js';
import { config } from '../../config.js';
import type { DailySyncSummary, OrgSyncResultForCron } from '../../lib/telematicsCronRun.js';
import { sendOrgWeeklyReports } from './sendOrgWeeklyReports.js';

export interface RunWeeklyDriverSmsOptions {
  dryRun?: boolean;
  onlyOrgId?: string;
  onlyDriverContactId?: string;
  /** Override the current time (for testing) */
  now?: Date;
  /**
   * If set, only enabled orgs with this sendHourEt value will send.
   * Used when running multiple Render cron entries (one per hour) so each
   * entry only fires for orgs configured for that hour. When omitted, all
   * enabled orgs send — appropriate for a single-cron setup where the
   * Render schedule itself is the gate.
   */
  targetHourEt?: number;
  /** Deprecated alias kept for compatibility. Same as omitting targetHourEt. */
  ignoreSendHour?: boolean;
}

export async function runWeeklyDriverSms(
  options: RunWeeklyDriverSmsOptions = {}
): Promise<DailySyncSummary> {
  const startedAt = Date.now();
  const prisma = getAppPrisma();

  // Global master kill-switch. Until WEEKLY_DRIVER_SMS_ENABLED=true is set in
  // the environment, this scheduled job is a guaranteed no-op regardless of
  // per-org customerSmsReportConfig.enabled — safe to ship the cron disabled.
  if (!config.weeklyDriverSmsEnabled) {
    console.log(
      '[smsWeeklyReports] master switch off (WEEKLY_DRIVER_SMS_ENABLED!=true) — skipping all orgs.'
    );
    return { totalOrgs: 0, successCount: 0, errorCount: 0, results: [], duration: Date.now() - startedAt };
  }

  const where: { enabled: boolean; clerkOrgId?: string; sendHourEt?: number } = { enabled: true };
  if (options.onlyOrgId) where.clerkOrgId = options.onlyOrgId;
  if (options.targetHourEt != null && !options.onlyOrgId) {
    where.sendHourEt = options.targetHourEt;
  }

  const configs = await prisma.customerSmsReportConfig.findMany({
    where,
    select: { clerkOrgId: true },
  });

  // Invalidate the per-org scorecard cache before building reports. The
  // Monday cron runs early morning ET; if Motive's late-Sunday sync wrote
  // any retroactive updates after the cache was warmed, we'd otherwise
  // serve stale data into the weekly snapshot.
  if (!options.dryRun || options.onlyOrgId) {
    const env = config.nodeEnv === 'production' ? 'prod' : 'dev';
    await Promise.all(
      configs.map((c) =>
        cacheDelPattern(`${env}:telematics:scorecard:${c.clerkOrgId}:*`).catch((e) =>
          console.warn(`[smsWeeklyReports] cache invalidation failed for ${c.clerkOrgId}: ${e.message}`),
        ),
      ),
    );
  }

  const results: OrgSyncResultForCron[] = [];
  let successCount = 0;
  let errorCount = 0;

  for (const cfg of configs) {
    const result = await sendOrgWeeklyReports(cfg.clerkOrgId, {
      dryRun: options.dryRun,
      onlyDriverContactId: options.onlyDriverContactId,
      now: options.now,
    });
    if (result.success) successCount++;
    else errorCount++;
    results.push({
      clerkOrgId: result.clerkOrgId,
      success: result.success,
      date: result.weekStart,
      verify: false,
      duration: result.duration,
      error: result.error,
      results: [
        {
          endpoint: 'sms-weekly-driver-report',
          date: result.weekStart,
          recordCount: result.driversTotal,
          newCount: result.driversSent,
          updatedCount: 0,
          unchangedCount: result.driversSkipped + result.driversNoPhone + result.driversOptedOut,
          errorCount: result.driversFailed,
          skipped: false,
        },
      ],
    });
  }

  return {
    totalOrgs: configs.length,
    successCount,
    errorCount,
    results,
    duration: Date.now() - startedAt,
  };
}
