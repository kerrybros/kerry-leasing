/**
 * Scheduled weekly driver SMS — runs runWeeklyDriverSms() across all enabled customers.
 * Called by the Render cron job (Mondays); can also be run manually for testing:
 *   pnpm exec tsx src/scripts/run-weekly-driver-sms.ts
 *   pnpm exec tsx src/scripts/run-weekly-driver-sms.ts --dry-run
 *   pnpm exec tsx src/scripts/run-weekly-driver-sms.ts --only-org=<clerkOrgId>
 *   pnpm exec tsx src/scripts/run-weekly-driver-sms.ts --ignore-send-hour
 */
import { runWeeklyDriverSms } from '../features/smsWeeklyReports/runWeeklyDriverSms.js';
import { recordTelematicsCronRun } from '../lib/telematicsCronRun.js';
import { CronJobType } from '../generated/app-client/index.js';

function parseArg(flag: string): string | true | null {
  const arg = process.argv.find((a) => a === flag || a.startsWith(`${flag}=`));
  if (!arg) return null;
  if (arg === flag) return true;
  return arg.split('=')[1];
}

async function main() {
  const dryRun = parseArg('--dry-run') !== null;
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

  const exitCode = summary.errorCount > 0 && summary.successCount === 0 ? 1 : 0;
  process.exit(exitCode);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
