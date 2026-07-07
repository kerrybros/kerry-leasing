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
  const [motive, samsara, weekly, diesel] = await Promise.all([
    lastSuccessAt(CronJobType.MOTIVE_DAILY),
    lastSuccessAt(CronJobType.SAMSARA_DAILY),
    lastSuccessAt(CronJobType.SMS_WEEKLY_DRIVER_REPORT),
    prisma.systemConfig.findUnique({
      where: { key: 'diesel_price_per_gallon' },
      select: { updatedAt: true },
    }),
  ]);

  return [
    { label: 'Motive daily sync', lastSuccessAt: motive, maxAgeHours: 26 },
    { label: 'Samsara daily sync', lastSuccessAt: samsara, maxAgeHours: 26 },
    { label: 'Weekly driver SMS/email', lastSuccessAt: weekly, maxAgeHours: 24 * 8 },
    { label: 'EIA diesel price', lastSuccessAt: diesel?.updatedAt ?? null, maxAgeHours: 48 },
  ];
}
