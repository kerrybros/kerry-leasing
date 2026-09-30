/**
 * Scheduled weekly driver SMS — runs runWeeklyDriverSms() across all enabled customers.
 * Called by the Render cron job (Mondays); can also be run manually for testing:
 *   pnpm exec tsx src/scripts/run-weekly-driver-sms.ts
 *   pnpm exec tsx src/scripts/run-weekly-driver-sms.ts --dry-run
 *   pnpm exec tsx src/scripts/run-weekly-driver-sms.ts --only-org=<clerkOrgId>
 *   pnpm exec tsx src/scripts/run-weekly-driver-sms.ts --ignore-send-hour
 *   pnpm exec tsx src/scripts/run-weekly-driver-sms.ts --dry-run --email-digest
 *
 * --email-digest emails the operator digest even on a dry run. That is the only
 * way to exercise the digest's delivery path without texting every driver, so
 * the alternative would be finding out it is broken on a Tuesday morning.
 */
import { runWeeklyDriverSms } from '../features/smsWeeklyReports/runWeeklyDriverSms.js';
import { recordTelematicsCronRun } from '../lib/telematicsCronRun.js';
import {
  buildWeeklyDigest,
  formatWeeklyDigestSubject,
  formatWeeklyDigestText,
  formatWeeklyDigestHtml,
} from '../features/smsWeeklyReports/weeklyDigest.js';
import { sendMail, type GraphClientConfig } from '../integrations/microsoft/graphClient.js';
import { CronJobType } from '../generated/app-client/index.js';

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
// Comma separated: the digest goes to whoever needs to see the week, which is
// at least the owner and the customer's fleet admin.
const digestEmails = (process.env.WEEKLY_DIGEST_EMAIL ?? '')
  .split(',')
  .map((a) => a.trim())
  .filter((a) => a.length > 0);

function parseArg(flag: string): string | true | null {
  const arg = process.argv.find((a) => a === flag || a.startsWith(`${flag}=`));
  if (!arg) return null;
  if (arg === flag) return true;
  return arg.split('=')[1];
}

async function main() {
  const dryRun = parseArg('--dry-run') !== null;
  const emailDigest = parseArg('--email-digest') !== null;
  const ignoreSendHour = parseArg('--ignore-send-hour') !== null;
  const onlyOrgArg = parseArg('--only-org');
  const onlyOrgId = typeof onlyOrgArg === 'string' ? onlyOrgArg : undefined;
  const targetHourArg = parseArg('--target-hour');
  const targetHourEt = typeof targetHourArg === 'string' ? parseInt(targetHourArg, 10) : undefined;

  console.log(
    `[smsWeeklyReports] Starting at ${new Date().toISOString()} ` +
      `dryRun=${dryRun} targetHourEt=${targetHourEt ?? '(none — all enabled orgs)'} ` +
      `onlyOrgId=${onlyOrgId ?? '(any)'}`,
  );
  const summary = await runWeeklyDriverSms({ dryRun, ignoreSendHour, onlyOrgId, targetHourEt });
  console.log(JSON.stringify(summary, null, 2));

  // A dry run must never mark the job as having succeeded: the health watchdog
  // reads these rows to decide whether the weekly send is overdue, so recording
  // one here would tell it a send happened when nothing was delivered.
  if (!dryRun) {
    try {
      await recordTelematicsCronRun(CronJobType.SMS_WEEKLY_DRIVER_REPORT, {
        totalOrgs: summary.totalOrgs,
        successCount: summary.successCount,
        errorCount: summary.errorCount,
        duration: summary.duration,
        results: summary.results,
      });
    } catch (e) {
      console.warn('[smsWeeklyReports] failed to record cron run summary', e);
    }
  }

  // Operator digest: who was sent what, who is new, what looks wrong. Printed
  // on a dry run and emailed on a real one, so the preview is the same document
  // that lands in the inbox. A digest failure must never fail the send itself:
  // the drivers already have their reports by this point.
  if (summary.orgResults.length > 0) {
    const digest = buildWeeklyDigest(summary.orgResults);
    const subject = formatWeeklyDigestSubject(digest, { preview: dryRun });
    const text = formatWeeklyDigestText(digest);
    // HTML is the real body: a text table collapses to gibberish in a mail
    // client's proportional font. Text stays as the fallback.
    const html = formatWeeklyDigestHtml(digest, { preview: dryRun });
    if (dryRun && !emailDigest) {
      console.log(`\n[digest] (dry run, not emailed)\nSubject: ${subject}\n\n${text}`);
    } else if (graphConfig && reportEmailFrom && digestEmails.length > 0) {
      try {
        await sendMail(graphConfig, {
          from: reportEmailFrom,
          to: digestEmails,
          subject: dryRun ? `[TEST, nothing sent to drivers] ${subject}` : subject,
          text: dryRun
            ? `This is a TEST digest from a dry run. No driver received anything.\n\n${text}`
            : text,
          html,
        });
        console.log(`[digest] emailed to ${digestEmails.join(', ')}`);
      } catch (e: any) {
        console.error(`[digest] failed to email digest: ${e?.message ?? e}`);
      }
    } else {
      console.warn('[digest] not emailed: WEEKLY_DIGEST_EMAIL, REPORT_EMAIL_FROM or MICROSOFT_GRAPH_* not set');
      console.log(`\n${subject}\n\n${text}`);
    }
  }

  const exitCode = summary.errorCount > 0 && summary.successCount === 0 ? 1 : 0;
  process.exit(exitCode);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
