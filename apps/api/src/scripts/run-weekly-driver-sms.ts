/**
 * Scheduled weekly driver SMS — runs runWeeklyDriverSms() across all enabled customers.
 * Called by the Render cron job (Mondays); can also be run manually for testing:
 *   pnpm exec tsx src/scripts/run-weekly-driver-sms.ts
 *   pnpm exec tsx src/scripts/run-weekly-driver-sms.ts --dry-run
 *   pnpm exec tsx src/scripts/run-weekly-driver-sms.ts --only-org=<clerkOrgId>
 *   pnpm exec tsx src/scripts/run-weekly-driver-sms.ts --only-driver=<driverContactId>
 *   pnpm exec tsx src/scripts/run-weekly-driver-sms.ts --ignore-send-hour
 *   pnpm exec tsx src/scripts/run-weekly-driver-sms.ts --dry-run --email-digest
 *   pnpm exec tsx src/scripts/run-weekly-driver-sms.ts --dry-run --email-digest --final
 *
 * --final drops the TEST banner and subject prefix so the clean report can be
 * forwarded as the customer-facing document. It still sends nothing to drivers.
 * Only use it once the real send for that week has actually run: the report
 * lists the drivers who WOULD receive a card, so ahead of the send it would
 * describe cards nobody has.
 *
 * --email-digest emails the operator digest even on a dry run. That is the only
 * way to exercise the digest's delivery path without texting every driver, so
 * the alternative would be finding out it is broken on a Tuesday morning.
 */
import { runWeeklyDriverSms } from '../features/smsWeeklyReports/runWeeklyDriverSms.js';
import { recordTelematicsCronRun } from '../lib/telematicsCronRun.js';
import {
  buildWeeklyDigest,
  formatReportSubject,
  formatExceptionsSubject,
  formatWeeklyDigestText,
  formatWeeklyDigestHtml,
  formatExceptionsHtml,
  missedDrivers,
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
  const finalRender = parseArg('--final') !== null;
  const ignoreSendHour = parseArg('--ignore-send-hour') !== null;
  const onlyOrgArg = parseArg('--only-org');
  // Resend to one driver, for a card missed on the scheduled run.
  const onlyDriverArg = parseArg('--only-driver');
  const onlyDriverContactId = typeof onlyDriverArg === 'string' ? onlyDriverArg : undefined;
  const onlyOrgId = typeof onlyOrgArg === 'string' ? onlyOrgArg : undefined;
  const targetHourArg = parseArg('--target-hour');
  const targetHourEt = typeof targetHourArg === 'string' ? parseInt(targetHourArg, 10) : undefined;

  console.log(
    `[smsWeeklyReports] Starting at ${new Date().toISOString()} ` +
      `dryRun=${dryRun} targetHourEt=${targetHourEt ?? '(none — all enabled orgs)'} ` +
      `onlyOrgId=${onlyOrgId ?? '(any)'}`,
  );
  const summary = await runWeeklyDriverSms({ dryRun, ignoreSendHour, onlyOrgId, targetHourEt, onlyDriverContactId });
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

  // Two reports, deliberately separate.
  //
  // The clean one lists only drivers who actually received a report, with no
  // status column, because it is the document that gets forwarded onward:
  // everything on it went out. The exceptions one carries whoever did not, and
  // why. A single document holding both could not be passed on without editing.
  //
  // Printed on a dry run and emailed on a real one, so the preview is the same
  // document that lands in the inbox. A report failure is caught and logged,
  // never allowed to fail the send: the drivers already have their cards.
  if (summary.orgResults.length > 0) {
    const digest = buildWeeklyDigest(summary.orgResults);
    const missed = missedDrivers(digest, dryRun);
    const clean = {
      subject: formatReportSubject(digest, { preview: dryRun }),
      text: formatWeeklyDigestText(digest),
      html: formatWeeklyDigestHtml(digest, { preview: dryRun, hideTestBanner: finalRender }),
    };
    // Silence when nothing went wrong: an exceptions email that arrives every
    // week stops being read by the week it matters.
    const exceptions =
      missed.length > 0 || digest.errors.length > 0
        ? {
            subject: formatExceptionsSubject(digest, { preview: dryRun }),
            text: missed.map((m) => `${m.displayName}: ${m.suppressedReason ?? 'not sent'}`).join('\n'),
            html: formatExceptionsHtml(digest, { preview: dryRun, hideTestBanner: finalRender }),
          }
        : null;

    if (dryRun && !emailDigest) {
      console.log(`\n[report] (dry run, not emailed)\nSubject: ${clean.subject}\n\n${clean.text}`);
      console.log(
        exceptions
          ? `\n[exceptions] (dry run, not emailed)\nSubject: ${exceptions.subject}\n${exceptions.text}`
          : '\n[exceptions] none: every driver received their report',
      );
    } else if (graphConfig && reportEmailFrom && digestEmails.length > 0) {
      const prefix = dryRun && !finalRender ? '[TEST, nothing sent to drivers] ' : '';
      for (const mail of [clean, exceptions]) {
        if (!mail) continue;
        try {
          await sendMail(graphConfig, {
            from: reportEmailFrom,
            to: digestEmails,
            subject: prefix + mail.subject,
            text:
              dryRun && !finalRender
                ? `This is a TEST from a dry run. No driver received anything.\n\n${mail.text}`
                : mail.text,
            html: mail.html,
          });
          console.log(`[report] emailed "${mail.subject}" to ${digestEmails.join(', ')}`);
        } catch (e: any) {
          console.error(`[report] failed to email "${mail.subject}": ${e?.message ?? e}`);
        }
      }
      if (!exceptions) console.log('[exceptions] not emailed: every driver received their report');
    } else {
      console.warn('[report] not emailed: WEEKLY_DIGEST_EMAIL, REPORT_EMAIL_FROM or MICROSOFT_GRAPH_* not set');
      console.log(`\n${clean.subject}\n\n${clean.text}`);
    }
  }

  const exitCode = summary.errorCount > 0 && summary.successCount === 0 ? 1 : 0;
  process.exit(exitCode);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
