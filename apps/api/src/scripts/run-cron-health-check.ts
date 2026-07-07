/**
 * Cron-health watchdog. Checks that each scheduled job has succeeded within its
 * expected window and emails an alert (via Graph) if any are overdue. Meant to
 * run as its own daily Render cron — the safety net that would have caught the
 * weekly-SMS cron dying for 51 days and the EIA cron dying for ~3 months.
 *
 * Env: APP_DATABASE_URL, MICROSOFT_GRAPH_*, REPORT_EMAIL_FROM, CRON_ALERT_EMAIL.
 */
import { getAppPrisma } from '../lib/prisma.js';
import { config } from '../config.js';
import { sendMail } from '../integrations/microsoft/graphClient.js';
import { CronJobType } from '../generated/app-client/index.js';
import {
  evaluateCronHealth,
  formatCronHealthAlert,
  type CronHealthCheck,
} from '../features/cronHealth/cronHealth.js';

async function lastSuccessAt(job: CronJobType): Promise<Date | null> {
  const row = await getAppPrisma().telematicsCronRun.findFirst({
    where: { job, allSucceeded: true },
    orderBy: { startedAt: 'desc' },
    select: { startedAt: true },
  });
  return row?.startedAt ?? null;
}

async function main() {
  const prisma = getAppPrisma();
  const now = new Date();

  const [motive, samsara, weekly, diesel] = await Promise.all([
    lastSuccessAt(CronJobType.MOTIVE_DAILY),
    lastSuccessAt(CronJobType.SAMSARA_DAILY),
    lastSuccessAt(CronJobType.SMS_WEEKLY_DRIVER_REPORT),
    prisma.systemConfig.findUnique({
      where: { key: 'diesel_price_per_gallon' },
      select: { updatedAt: true },
    }),
  ]);

  const checks: CronHealthCheck[] = [
    { label: 'Motive daily sync', lastSuccessAt: motive, maxAgeHours: 26 },
    { label: 'Samsara daily sync', lastSuccessAt: samsara, maxAgeHours: 26 },
    { label: 'Weekly driver SMS/email', lastSuccessAt: weekly, maxAgeHours: 24 * 8 },
    { label: 'EIA diesel price', lastSuccessAt: diesel?.updatedAt ?? null, maxAgeHours: 48 },
  ];

  const results = evaluateCronHealth(checks, now);
  for (const r of results) {
    console.log(
      `[cronHealth] ${r.overdue ? 'OVERDUE' : 'ok     '} ${r.label} — ` +
        `${r.ageHours == null ? 'never run' : Math.round(r.ageHours) + 'h ago'}`,
    );
  }

  const alert = formatCronHealthAlert(results, now);
  if (!alert) {
    console.log('[cronHealth] all jobs healthy — no alert sent.');
    await prisma.$disconnect();
    return;
  }

  if (!config.microsoftGraph || !config.reportEmailFrom || !config.cronAlertEmail) {
    console.warn(
      '[cronHealth] jobs overdue but email is not configured ' +
        '(need MICROSOFT_GRAPH_*, REPORT_EMAIL_FROM, CRON_ALERT_EMAIL) — skipping alert email.',
    );
    await prisma.$disconnect();
    process.exitCode = 1;
    return;
  }

  try {
    await sendMail(config.microsoftGraph, {
      from: config.reportEmailFrom,
      to: config.cronAlertEmail,
      subject: alert.subject,
      text: alert.text,
      html: alert.html,
    });
    console.log(`[cronHealth] alert emailed to ${config.cronAlertEmail}`);
  } catch (e) {
    console.error('[cronHealth] failed to send alert email:', e);
    process.exitCode = 1;
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
