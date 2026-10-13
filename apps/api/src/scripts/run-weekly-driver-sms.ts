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
 *   pnpm exec tsx src/scripts/run-weekly-driver-sms.ts --mode=prepare --at-et-hour=7
 *   pnpm exec tsx src/scripts/run-weekly-driver-sms.ts --mode=dispatch --at-et-hour=10
 *   pnpm exec tsx src/scripts/run-weekly-driver-sms.ts --prepare-at-et=7 --dispatch-at-et=10
 *
 * --mode splits the week in two so the operator report can be real hours before
 * the drivers get anything. prepare freezes every card and emails the report
 * built from those exact rows; dispatch sends those rows verbatim and emails
 * only if something needs attention. Without it, the original one-pass
 * behaviour is unchanged.
 *
 * --at-et-hour makes the schedule daylight-saving proof. Render crons are UTC,
 * so a fixed UTC time silently moves an hour in November: 14:00 UTC is 10:00
 * EDT today and 09:00 EST from 2026-11-03. Run the cron every hour and let this
 * gate pick the right one in Eastern.
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
  sentDrivers,
} from '../features/smsWeeklyReports/weeklyDigest.js';
import { buildDigestFromSends } from '../features/smsWeeklyReports/digestFromSends.js';
import { formatDivergenceText } from '../features/smsWeeklyReports/frozenDivergence.js';
import type { ReachMode } from '../features/smsWeeklyReports/weeklyDigest.js';
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

/** Current hour where the drivers are, 0 to 23. */
function etHour(d: Date): number {
  return parseInt(
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }).format(d),
    10,
  );
}

function parseArg(flag: string): string | true | null {
  const arg = process.argv.find((a) => a === flag || a.startsWith(`${flag}=`));
  if (!arg) return null;
  if (arg === flag) return true;
  return arg.split('=')[1];
}

function hourArg(flag: string): number | null {
  const v = parseArg(flag);
  if (typeof v !== 'string') return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
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
  // Which phase, and is this the hour for it?
  //
  // Render schedules in UTC, so a fixed UTC time moves an hour when the clocks
  // change: 14:00 UTC is 10:00 EDT today and 09:00 EST from 2026-11-03. Rather
  // than chase that twice a year, the cron fires at both candidate UTC hours
  // and this picks the one that is actually the right hour in Eastern. Exactly
  // one fires, year round, with no schedule edit.
  const nowEtHour = etHour(new Date());
  const prepareAt = hourArg('--prepare-at-et');
  const dispatchAt = hourArg('--dispatch-at-et');

  let mode: 'send' | 'prepare' | 'dispatch';
  if (prepareAt != null || dispatchAt != null) {
    if (prepareAt === nowEtHour) mode = 'prepare';
    else if (dispatchAt === nowEtHour) mode = 'dispatch';
    else {
      console.log(
        `[smsWeeklyReports] ${nowEtHour}:00 ET is neither the prepare hour ` +
          `(${prepareAt ?? 'unset'}) nor the dispatch hour (${dispatchAt ?? 'unset'}). Nothing to do.`,
      );
      process.exit(0);
    }
  } else {
    const modeArg = parseArg('--mode');
    mode = (typeof modeArg === 'string' ? modeArg : 'send') as 'send' | 'prepare' | 'dispatch';
    if (!['send', 'prepare', 'dispatch'].includes(mode)) {
      console.error(`[smsWeeklyReports] unknown --mode=${mode}; expected send, prepare or dispatch`);
      process.exit(1);
    }
    const atEtHour = hourArg('--at-et-hour');
    if (atEtHour != null && atEtHour !== nowEtHour) {
      console.log(`[smsWeeklyReports] not the hour: ${nowEtHour}:00 ET, waiting for ${atEtHour}:00 ET. Nothing to do.`);
      process.exit(0);
    }
  }
  const isPrepare = mode === 'prepare';

  // A prepare writes the week's rows; a dispatch reads them. Neither is a
  // preview, so neither carries the TEST banner.
  const showBanner = dryRun && !finalRender && !isPrepare;
  const reach: ReachMode = isPrepare ? 'prepared' : showBanner ? 'preview' : 'sent';

  /** Short operator note, used by dispatch and by a held prepare. */
  async function emailOperator(subject: string, text: string): Promise<void> {
    if (!graphConfig || !reportEmailFrom || digestEmails.length === 0) {
      console.warn(`[report] not emailed (mail not configured): ${subject}`);
      console.log(text);
      return;
    }
    const escaped = text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] as string);
    try {
      await sendMail(graphConfig, {
        from: reportEmailFrom,
        to: digestEmails,
        subject,
        text,
        html: `<pre style="font:13px/1.5 ui-monospace,Menlo,monospace">${escaped}</pre>`,
      });
      console.log(`[report] emailed "${subject}" to ${digestEmails.join(', ')}`);
    } catch (e: any) {
      console.error(`[report] failed to email "${subject}": ${e?.message ?? e}`);
    }
  }

  console.log(
    `[smsWeeklyReports] Starting at ${new Date().toISOString()} ` +
      `mode=${mode} dryRun=${dryRun} targetHourEt=${targetHourEt ?? '(none, all enabled orgs)'} ` +
      `onlyOrgId=${onlyOrgId ?? '(any)'}`,
  );
  const summary = await runWeeklyDriverSms({ dryRun, ignoreSendHour, onlyOrgId, targetHourEt, onlyDriverContactId, mode });
  console.log(JSON.stringify(summary, null, 2));

  // A dry run must never mark the job as having succeeded: the health watchdog
  // reads these rows to decide whether the weekly send is overdue, so recording
  // one here would tell it a send happened when nothing was delivered.
  if (!dryRun && mode !== 'prepare') {
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
  // The clean one lists only drivers who received a report, with no status
  // column, because it is the document that gets forwarded onward: everything
  // on it went out. The exceptions one carries whoever did not, and why. A
  // single document holding both could not be passed on without editing.
  //
  // Printed on a dry run and emailed otherwise, so the preview is the same
  // document that lands in the inbox. A report failure is caught and logged,
  // never allowed to fail the send: the drivers already have their cards.

  // Dispatch sends cards that were already reported on at prepare time, so it
  // does not email the week again. It speaks up only when something needs a
  // human: a figure that moved after the freeze, or a card that did not go.
  if (mode === 'dispatch') {
    const failed = summary.dispatched.reduce((a, d) => a + d.failed, 0);
    const note = formatDivergenceText(summary.divergence);
    if (note || failed > 0) {
      const lines = [
        ...(failed > 0
          ? [
              `${failed} card${failed === 1 ? '' : 's'} failed to send.`,
              ...summary.dispatched.flatMap((d) => d.errors.map((e) => `  ${e}`)),
              '',
            ]
          : []),
        ...(note ? [note] : []),
      ];
      await emailOperator(`Weekly driver report: ${failed > 0 ? 'send errors' : 'figures changed after freeze'}`, lines.join('\n'));
    } else {
      console.log('[dispatch] every frozen card sent and no figure moved since the freeze');
    }
    const sent = summary.dispatched.reduce((a, d) => a + d.sent, 0);
    console.log(`[dispatch] sent ${sent}, failed ${failed}, already delivered ${summary.dispatched.reduce((a, d) => a + d.alreadyDelivered, 0)}`);
  }

  // A held prepare is not a failure: the week simply was not settled enough to
  // freeze, and the ordinary send still runs later. It does need saying out
  // loud, because the 07:00 report will not arrive.
  if (summary.held.length > 0) {
    const lines = summary.held.map(
      (h) => `${h.clerkOrgId}: ${h.readiness.reason}`,
    );
    await emailOperator(
      'Weekly driver report: held, data not settled',
      [
        'The week was not frozen, so there is no early report this morning.',
        'Nothing is lost: the scheduled send still runs and the cards go out as usual.',
        '',
        ...lines,
      ].join('\n'),
    );
  }

  if (mode !== 'dispatch' && summary.orgResults.length > 0) {
    let digest = buildWeeklyDigest(summary.orgResults);

    // A report has to describe real cards. --final states what a week's drivers
    // received and prepare states what they are about to receive, and both read
    // the frozen rows rather than this run's fresh build. Rebuilding was only
    // ever right by coincidence: Motive's weekly safety refresh or a later
    // portal pull landing in between would produce a document that disagreed
    // with the cards it claims to describe.
    if (finalRender || isPrepare) {
      const first = summary.orgResults[0];
      const fromSends = await buildDigestFromSends(first.clerkOrgId, first.weekStart, first.weekEnd);
      if (fromSends.length === 0) {
        console.error(
          `[report] refused: no rows recorded for ${first.clerkOrgId} week ${first.weekStart}. ` +
            'A report claiming cards nobody has would be worse than none.',
        );
        process.exit(1);
      }
      digest = { ...digest, drivers: fromSends };
      console.log(`[report] built from ${fromSends.length} stored row(s), not a fresh build`);
    }

    // Preparing a week that already went out has nothing to report on: the
    // already-delivered guard protects those rows, so none of them are QUEUED
    // and the clean report would come out empty. Say so rather than emailing a
    // report with no drivers on it.
    if (isPrepare && sentDrivers(digest, 'prepared').length === 0) {
      console.log(
        `[report] nothing to prepare for week ${summary.orgResults[0].weekStart}: ` +
          'every driver already has their card. No report emailed.',
      );
      process.exit(0);
    }

    const missed = missedDrivers(digest, reach);
    const clean = {
      subject: formatReportSubject(digest, { reach }),
      text: formatWeeklyDigestText(digest),
      html: formatWeeklyDigestHtml(digest, { preview: showBanner, hideTestBanner: !showBanner, reach }),
    };
    // Silence when nothing went wrong: an exceptions email that arrives every
    // week stops being read by the week it matters.
    const exceptions =
      missed.length > 0 || digest.errors.length > 0
        ? {
            subject: formatExceptionsSubject(digest, { reach }),
            text: missed.map((m) => `${m.displayName}: ${m.suppressedReason ?? 'not sent'}`).join('\n'),
            html: formatExceptionsHtml(digest, { preview: showBanner, hideTestBanner: !showBanner, reach }),
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
      const prefix = showBanner ? '[TEST, nothing sent to drivers] ' : '';
      for (const mail of [clean, exceptions]) {
        if (!mail) continue;
        try {
          await sendMail(graphConfig, {
            from: reportEmailFrom,
            to: digestEmails,
            subject: prefix + mail.subject,
            text: showBanner
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
