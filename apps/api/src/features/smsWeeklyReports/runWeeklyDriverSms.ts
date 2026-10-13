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
import { sendOrgWeeklyReports, type SendOrgResult, type SendMode } from './sendOrgWeeklyReports.js';
import { dispatchFrozenWeek, type DispatchResult } from './dispatchFrozenWeek.js';
import { checkWeekReadiness, type WeekReadiness } from './weekReadiness.js';
import { diffFrozenAgainstFresh, type FrozenDivergence } from './frozenDivergence.js';
import { getLastWeekRange } from './dateWindow.js';

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
  /**
   * 'send'     one pass: build, freeze and dispatch. The original behaviour.
   * 'prepare'  freeze the week and send nothing, so the operator report built
   *            from those rows is the real document hours before dispatch.
   * 'dispatch' send the frozen rows verbatim, recomputing nothing.
   */
  mode?: SendMode | 'dispatch';
}

export interface WeeklyRunExtras {
  orgResults: SendOrgResult[];
  /** prepare only: weeks held back because the data was not settled. */
  held: Array<{ clerkOrgId: string; readiness: WeekReadiness }>;
  /** dispatch only. */
  dispatched: DispatchResult[];
  /** dispatch only: figures that moved after the freeze. */
  divergence: FrozenDivergence[];
}

export async function runWeeklyDriverSms(
  options: RunWeeklyDriverSmsOptions = {}
): Promise<DailySyncSummary & WeeklyRunExtras> {
  const startedAt = Date.now();
  const prisma = getAppPrisma();

  // Global master kill-switch. Until WEEKLY_DRIVER_SMS_ENABLED=true is set in
  // the environment, this scheduled job is a guaranteed no-op regardless of
  // per-org customerSmsReportConfig.enabled — safe to ship the cron disabled.
  if (!config.weeklyDriverSmsEnabled) {
    console.log(
      '[smsWeeklyReports] master switch off (WEEKLY_DRIVER_SMS_ENABLED!=true) — skipping all orgs.'
    );
    return { orgResults: [], held: [], dispatched: [], divergence: [], totalOrgs: 0, successCount: 0, errorCount: 0, results: [], duration: Date.now() - startedAt };
  }
  const mode = options.mode ?? 'send';

  const where: { enabled: boolean; clerkOrgId?: string; sendHourEt?: number } = { enabled: true };
  if (options.onlyOrgId) where.clerkOrgId = options.onlyOrgId;
  if (options.targetHourEt != null && !options.onlyOrgId) {
    where.sendHourEt = options.targetHourEt;
  }

  const configsRaw = await prisma.customerSmsReportConfig.findMany({
    where,
    select: { clerkOrgId: true },
  });

  // Weekly driver reports are Motive-only — the headline safety number is
  // Motive's own rolling score, which Samsara orgs don't have. Skip any enabled
  // org whose active telematics provider isn't Motive.
  const motiveOrgIds = new Set(
    (
      await prisma.telematicsProviderAccount.findMany({
        where: {
          clerkOrgId: { in: configsRaw.map((c) => c.clerkOrgId) },
          provider: 'MOTIVE',
          status: 'ACTIVE',
        },
        select: { clerkOrgId: true },
      })
    ).map((a) => a.clerkOrgId),
  );
  const skippedNonMotive = configsRaw.filter((c) => !motiveOrgIds.has(c.clerkOrgId));
  if (skippedNonMotive.length > 0) {
    console.log(
      `[smsWeeklyReports] skipping ${skippedNonMotive.length} non-Motive org(s): ${skippedNonMotive.map((c) => c.clerkOrgId).join(', ')}`,
    );
  }
  const configs = configsRaw.filter((c) => motiveOrgIds.has(c.clerkOrgId));

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
  const orgResults: SendOrgResult[] = [];
  const held: WeeklyRunExtras['held'] = [];
  const dispatched: DispatchResult[] = [];
  const divergence: FrozenDivergence[] = [];
  let successCount = 0;
  let errorCount = 0;

  for (const cfg of configs) {
    // Dispatch never rebuilds. It sends what prepare froze, and falls back to a
    // full one-pass send only when there is nothing frozen to send, so a held
    // or skipped prepare can never cost a week.
    if (mode === 'dispatch') {
      const d = await dispatchFrozenWeek(cfg.clerkOrgId, {
        now: options.now,
        dryRun: options.dryRun,
        onlyDriverContactId: options.onlyDriverContactId,
      });
      dispatched.push(d);
      if (d.hadFrozenWeek) {
        if (d.failed === 0) successCount++;
        else errorCount++;
        results.push(cronRow(cfg.clerkOrgId, d.weekStart, d.failed === 0, d.queued, d.sent, d.failed));
        if (!options.dryRun) {
          divergence.push(
            ...(await diffFrozenAgainstFresh(cfg.clerkOrgId, d.weekStart, options.now).catch((e) => {
              console.warn(`[smsWeeklyReports] divergence check failed for ${cfg.clerkOrgId}: ${e.message}`);
              return [];
            })),
          );
        }
        continue;
      }
      console.warn(
        `[smsWeeklyReports] ${cfg.clerkOrgId}: nothing frozen for week ${d.weekStart}, falling back to a full send.`,
      );
    }

    // Freezing locks the week in for every driver, so only freeze data that has
    // settled. Not ready means hold: the fallback above still sends the week.
    if (mode === 'prepare') {
      const week = getLastWeekRange(options.now ?? new Date());
      const readiness = await checkWeekReadiness(cfg.clerkOrgId, week.startDate, week.endDate);
      if (!readiness.ready) {
        console.warn(`[smsWeeklyReports] ${cfg.clerkOrgId}: holding the freeze, ${readiness.reason}`);
        held.push({ clerkOrgId: cfg.clerkOrgId, readiness });
        continue;
      }
    }

    const result = await sendOrgWeeklyReports(cfg.clerkOrgId, {
      dryRun: options.dryRun,
      onlyDriverContactId: options.onlyDriverContactId,
      now: options.now,
      mode: mode === 'dispatch' ? 'send' : mode,
    });
    orgResults.push(result);
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
          unchangedCount:
            result.driversSkipped +
            result.driversNoPhone +
            result.driversOptedOut +
            result.driversNoConsent,
          errorCount: result.driversFailed,
          skipped: false,
        },
      ],
    });
  }

  return {
    orgResults,
    held,
    dispatched,
    divergence,
    totalOrgs: configs.length,
    successCount,
    errorCount,
    results,
    duration: Date.now() - startedAt,
  };
}

function cronRow(
  clerkOrgId: string,
  date: string,
  success: boolean,
  queued: number,
  sent: number,
  failed: number,
): OrgSyncResultForCron {
  return {
    clerkOrgId,
    success,
    date,
    verify: false,
    duration: 0,
    results: [
      {
        endpoint: 'sms-weekly-driver-report-dispatch',
        date,
        recordCount: queued,
        newCount: sent,
        updatedCount: 0,
        unchangedCount: Math.max(0, queued - sent - failed),
        errorCount: failed,
        skipped: false,
      },
    ],
  };
}
