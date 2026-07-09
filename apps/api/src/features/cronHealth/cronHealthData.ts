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
  const [motive, samsara, weekly, diesel, weeklyDelivered] = await Promise.all([
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
  ];
}
