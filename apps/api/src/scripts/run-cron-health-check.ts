/**
 * Cron-health watchdog. Checks that each scheduled job has succeeded within its
 * expected window, and that every driver who is actually working can receive a
 * weekly scorecard. Emails an alert (via Graph) when either is wrong.
 *
 * The reachability half was added after two drivers went unreported for months:
 * their phone numbers were held by departed drivers, the sync dropped the field
 * on a unique constraint and warned to a log nobody reads, and every weekly run
 * skipped them in silence. A working driver who cannot be reached now shouts.
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
import { evaluateDriverReachability, formatReachabilityAlert } from '../features/drivers/driverReachability.js';
import { gatherDriverReachability, DEFAULT_LOOKBACK_DAYS } from '../features/drivers/driverReachabilityData.js';

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

  // Driver reachability: is anyone driving who can never receive a scorecard?
  const { drivers, stalePhoneHolders } = await gatherDriverReachability(prisma, now, DEFAULT_LOOKBACK_DAYS);
  const reach = evaluateDriverReachability(drivers, stalePhoneHolders, DEFAULT_LOOKBACK_DAYS);
  const reachAlert = formatReachabilityAlert(reach);
  console.log(
    `[driverReachability] checked ${reach.driversChecked} working driver(s): ` +
      `${reach.unreachable.length} unreachable, ${reach.stalePhoneHolders.length} phone(s) on a departed driver`,
  );
  for (const u of reach.unreachable) console.log(`[driverReachability] UNREACHABLE ${u.displayName} (${u.reason}, ${u.activeDays}d)`);

  const cronAlert = formatCronHealthAlert(results, now);
  if (!cronAlert && !reachAlert) {
    console.log('[cronHealth] all jobs healthy and every working driver reachable. No alert sent.');
    await prisma.$disconnect();
    return;
  }

  // One email either way, so a quiet inbox keeps meaning "nothing is wrong".
  const alert = cronAlert && reachAlert
    ? {
        subject: `${cronAlert.subject} + ${reach.unreachable.length} unreachable driver(s)`,
        text: `${cronAlert.text}\n\n---\n\n${reachAlert.text}`,
        html: `${cronAlert.html}<hr style="margin:24px 0;border:none;border-top:1px solid #ddd">${reachAlert.html}`,
      }
    : (cronAlert ?? reachAlert)!;

  if (!graphConfig || !reportEmailFrom || !cronAlertEmail) {
    console.warn(
      '[cronHealth] alert raised but email is not configured ' +
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
