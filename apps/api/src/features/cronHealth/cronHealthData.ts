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
      // WHERE this check runs is the point of it, so the timing is written
      // down rather than left to be rediscovered.
      //
      // It runs at 06:30 ET, between the 06:00 ET Motive pull and the 07:00 ET
      // weekly freeze. The freeze is the first thing that consumes the pull,
      // and it locks the week in for every driver, so a dead pull has to shout
      // BEFORE it rather than after.
      //
      // It used to run at 13:30 UTC, chosen to sit between a 13:00 pull and a
      // 14:00 send. Both of those moved on 2026-10-13 when the send was split
      // into prepare and dispatch, which left this sitting after the freeze
      // instead of before it, and drifting to 08:30 ET every November.
      //
      // 12h rather than 24h, because the pull now runs twice a day (06:00 and
      // 09:00 ET). At 06:30 a healthy intake is half an hour old and a missed
      // 06:00 pull is 21.5 hours old, so anything between those two separates
      // them cleanly; 24h could not tell them apart and stayed silent through a
      // failed morning pull.
      label: 'Motive report intake',
      lastSuccessAt: reportIngest,
      maxAgeHours: 12,
      live: reportEverIngested != null,
      note: reportEverIngested ? undefined : 'not live: no report file ingested yet',
    },
  ];
}
