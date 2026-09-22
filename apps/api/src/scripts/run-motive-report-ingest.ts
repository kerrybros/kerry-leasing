/**
 * Motive scheduled-report mailbox intake, cron entrypoint.
 *
 * Pulls Driver Fuel Performance CSV emails from MOTIVE_REPORT_MAILBOX via Graph
 * and stores them (see features/motiveReport). Schedule daily after Motive's
 * 12:00 AM ET report run; the 14-day lookback + idempotent sourceRef means a
 * missed day is picked up on the next run.
 *
 *   pnpm exec tsx src/scripts/run-motive-report-ingest.ts [--dry-run] [--lookback-days=14]
 */
import { ingestMotiveReportMailbox } from '../features/motiveReport/ingestMailbox.js';
import { recordTelematicsCronRun } from '../lib/telematicsCronRun.js';
import { CronJobType } from '../generated/app-client/index.js';

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const lb = process.argv.find((a) => a.startsWith('--lookback-days='));
  const lookbackDays = lb ? Number(lb.split('=')[1]) : undefined;

  console.log(`[motive-report] intake starting ${new Date().toISOString()} dryRun=${dryRun}`);
  const s = await ingestMotiveReportMailbox({ dryRun, lookbackDays });

  for (const e of s.emails) {
    const w = e.window ? `${e.window.start}..${e.window.end} (${e.window.granularity})` : '-';
    const un = e.unmatchedDriverNames.length ? ` unmatched=[${e.unmatchedDriverNames.join('; ')}]` : '';
    console.log(`  ${e.status.padEnd(13)} ${w.padEnd(30)} rows=${String(e.rowCount).padStart(3)} org=${e.clerkOrgId ?? '-'} "${e.subject}"${e.error ? ` :: ${e.error}` : ''}${un}`);
  }
  console.log(`[motive-report] scanned=${s.scanned} ingested=${s.ingested} unverified=${s.unverified} duplicates=${s.duplicates} unrouted=${s.unrouted} failed=${s.failed} in ${s.duration}ms${s.skippedReason ? ` SKIPPED: ${s.skippedReason}` : ''}`);

  if (!dryRun && !s.skippedReason) {
    await recordTelematicsCronRun(CronJobType.MOTIVE_REPORT_INGEST, {
      totalOrgs: s.scanned,
      successCount: s.ingested + s.duplicates,
      errorCount: s.failed + s.unrouted + s.unverified,
      duration: s.duration,
      results: s.emails.map((e) => ({
        clerkOrgId: e.clerkOrgId ?? 'unrouted',
        success: e.status === 'ingested' || e.status === 'duplicate',
          // unverified files are stored but count as a failure so cron-health surfaces them
        date: e.window?.start ?? e.receivedAt.slice(0, 10),
        verify: false,
        duration: 0,
        error: e.error,
        results: [{
          endpoint: 'driver_fuel_performance_csv',
          date: e.window?.start ?? '',
          recordCount: e.rowCount,
          newCount: e.status === 'ingested' ? e.rowCount : 0,
          updatedCount: 0,
          unchangedCount: e.status === 'duplicate' ? e.rowCount : 0,
          errorCount: e.status === 'ingested' || e.status === 'duplicate' ? 0 : 1,
        }],
      })),
    });
  }
  process.exit(s.failed > 0 || s.unverified > 0 || s.skippedReason ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
