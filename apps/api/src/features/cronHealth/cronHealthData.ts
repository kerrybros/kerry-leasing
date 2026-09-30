/**
 * Gathers the last-success freshness signals for each scheduled job from the app
 * DB, shaped into CronHealthCheck[] for evaluateCronHealth. Shared by the
 * watchdog cron (run-cron-health-check.ts) and GET /admin/ops-status so both
 * read the same signals and thresholds.
 */
import { getAppPrisma } from '../../lib/prisma.js';
import { CronJobType } from '../../generated/app-client/index.js';
import type { CronHealthCheck } from './cronHealth.js';

async function lastSuccessAt(job: CronJobType): Promise<Date | null> {
  const row = await getAppPrisma().telematicsCronRun.findFirst({
    where: { job, allSucceeded: true },
    orderBy: { startedAt: 'desc' },
    select: { startedAt: true },
  });
  return row?.startedAt ?? null;
}

export async function gatherCronHealthChecks(): Promise<CronHealthCheck[]> {
  const prisma = getAppPrisma();
  const [motive, samsara, weekly, diesel, weeklyDelivered, reportIngest, reportEverIngested] = await Promise.all([
    lastSuccessAt(CronJobType.MOTIVE_DAILY),
    lastSuccessAt(CronJobType.SAMSARA_DAILY),
    lastSuccessAt(CronJobType.SMS_WEEKLY_DRIVER_REPORT),
    prisma.systemConfig.findUnique({
      where: { key: 'diesel_price_per_gallon' },
      select: { updatedAt: true },
    }),
    // The weekly driver report is "live" only once an enabled org has actually
    // delivered a report (lastSentAt is set on the first real send). Before that
    // it's pre-live — no opt-in consent collected and/or no channel enabled — so
    // "0 sent" is expected, not a failure. Report it as idle instead of overdue.
    prisma.customerSmsReportConfig.findFirst({
      where: { enabled: true, lastSentAt: { not: null } },
      select: { lastSentAt: true },
    }),
    lastSuccessAt(CronJobType.MOTIVE_REPORT_INGEST),
    // Live once ANY report file has been stored, by whichever route. This used
    // to look only for SCHEDULED_EMAIL, which meant the job stayed permanently
    // "idle" after we moved to the portal pull: it would never have alerted if
    // the pull died, and a dead pull is what starves the weekly scorecard.
    prisma.motiveReportIngest.findFirst({ select: { id: true } }),
  ]);

  const weeklyLive = weeklyDelivered != null;

  return [
    { label: 'Motive daily sync', lastSuccessAt: motive, maxAgeHours: 26 },
    { label: 'Samsara daily sync', lastSuccessAt: samsara, maxAgeHours: 26 },
    {
      label: 'Weekly driver SMS/email',
      lastSuccessAt: weekly,
      maxAgeHours: 24 * 8,
      live: weeklyLive,
      note: weeklyLive ? undefined : 'not live — no report delivered yet',
    },
    { label: 'EIA diesel price', lastSuccessAt: diesel?.updatedAt ?? null, maxAgeHours: 48 },
    {
      // 24h, and the watchdog runs at 13:30, BETWEEN the 13:00 portal pull and
      // the 14:00 Tuesday send.
      //
      // Two problems put it there. With the watchdog and the pull both at
      // 13:00 and a 26h limit, a pull that failed at 13:01 still looked ~23h
      // fresh and went unreported for a day; on 2026-09-30 Render's own email
      // beat this check to a real failure. Moving it to 14:00 fixed that but
      // landed it in the same minute as the Tuesday send, so the alert and the
      // send raced and the week could go out unheralded either way.
      //
      // At 13:30 a missed pull reads ~24.5h and alarms 30 minutes BEFORE the
      // send that depends on it, while a healthy pull reads ~0.5h. The pull
      // takes about two minutes, so that leaves roughly 15 times its normal
      // duration of slack before a merely slow pull could cry wolf.
      label: 'Motive report intake',
      lastSuccessAt: reportIngest,
      maxAgeHours: 24,
      live: reportEverIngested != null,
      note: reportEverIngested ? undefined : 'not live: no report file ingested yet',
    },
  ];
}
