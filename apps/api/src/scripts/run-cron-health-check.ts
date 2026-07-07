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
import { evaluateCronHealth, formatCronHealthAlert } from '../features/cronHealth/cronHealth.js';
import { gatherCronHealthChecks } from '../features/cronHealth/cronHealthData.js';

async function main() {
  const prisma = getAppPrisma();
  const now = new Date();

  const results = evaluateCronHealth(await gatherCronHealthChecks(), now);
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
