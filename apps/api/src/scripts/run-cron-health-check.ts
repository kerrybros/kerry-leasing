/**
 * Cron-health watchdog. Checks that each scheduled job has succeeded within its
 * expected window and emails an alert (via Graph) if any are overdue.
 *
 * CONFIG-FREE by design: like the other cron entry scripts, it reads only its own
 * env directly and does NOT import ../config (which validates the full app's
 * required vars, e.g. CLERK_SECRET_KEY, at module load — vars this watchdog cron
 * neither has nor needs).
 *
 * Env: APP_DATABASE_URL, MICROSOFT_GRAPH_*, REPORT_EMAIL_FROM, CRON_ALERT_EMAIL.
 */
import { getAppPrisma } from '../lib/prisma.js';
import { sendMail, type GraphClientConfig } from '../integrations/microsoft/graphClient.js';
import { evaluateCronHealth, formatCronHealthAlert } from '../features/cronHealth/cronHealth.js';
import { gatherCronHealthChecks } from '../features/cronHealth/cronHealthData.js';

const graphConfig: GraphClientConfig | null = process.env.MICROSOFT_GRAPH_TENANT_ID
  ? {
      tenantId: process.env.MICROSOFT_GRAPH_TENANT_ID,
      clientId: process.env.MICROSOFT_GRAPH_CLIENT_ID ?? '',
      clientSecret: process.env.MICROSOFT_GRAPH_CLIENT_SECRET ?? '',
      // sendMail doesn't use these, but the type requires them.
      siteHostname: process.env.MICROSOFT_GRAPH_SITE_HOSTNAME ?? '',
      sitePath: process.env.MICROSOFT_GRAPH_SITE_PATH ?? '',
    }
  : null;
const reportEmailFrom = process.env.REPORT_EMAIL_FROM ?? null;
const cronAlertEmail = process.env.CRON_ALERT_EMAIL ?? reportEmailFrom;

async function main() {
  const prisma = getAppPrisma();
  const now = new Date();

  const results = evaluateCronHealth(await gatherCronHealthChecks(), now);
  for (const r of results) {
    const tag = r.status === 'overdue' ? 'OVERDUE' : r.status === 'idle' ? 'idle   ' : 'ok     ';
    const detail =
      r.status === 'idle'
        ? (r.note ?? 'not live')
        : r.ageHours == null
          ? 'never run'
          : Math.round(r.ageHours) + 'h ago';
    console.log(`[cronHealth] ${tag} ${r.label} — ${detail}`);
  }

  const alert = formatCronHealthAlert(results, now);
  if (!alert) {
    console.log('[cronHealth] all jobs healthy — no alert sent.');
    await prisma.$disconnect();
    return;
  }

  if (!graphConfig || !reportEmailFrom || !cronAlertEmail) {
    console.warn(
      '[cronHealth] jobs overdue but email is not configured ' +
        '(need MICROSOFT_GRAPH_*, REPORT_EMAIL_FROM, CRON_ALERT_EMAIL) — skipping alert email.',
    );
    await prisma.$disconnect();
    process.exitCode = 1;
    return;
  }

  try {
    await sendMail(graphConfig, {
      from: reportEmailFrom,
      to: cronAlertEmail,
      subject: alert.subject,
      text: alert.text,
      html: alert.html,
    });
    console.log(`[cronHealth] alert emailed to ${cronAlertEmail}`);
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
