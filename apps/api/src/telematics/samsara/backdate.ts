/**
 * SAMSARA HISTORICAL BACKDATE
 *
 * Pulls historical data day-by-day for a given org and date range.
 * Idempotent — safe to re-run any date range. All writes are upserts.
 *
 * 72-hour verify window: dates within 3 calendar days of today are treated
 * as "fresh" (verify: true) so already-stored records are force-refreshed.
 * Samsara has up to 72h data lag; older dates have finalized data on their
 * servers — upserts still detect and write any differences on re-runs.
 *
 * Usage (CLI):
 *   pnpm exec tsx src/telematics/samsara/backdate.ts \
 *     --org=org_xxxxx --start=2026-02-01 --end=2026-02-28
 *
 * Can also be imported and called programmatically:
 *   import { backdateSamsaraData } from './backdate.js';
 *   await backdateSamsaraData({ clerkOrgId, startDate, endDate });
 */

import { fileURLToPath } from 'url';
import { appPrisma } from '../../lib/prisma.js';
import { syncSamsaraOrgForDate } from './syncService.js';
import { getDateRange } from './types.js';
import { readCredentials } from '../../lib/credentials.js';
import type { SyncResult } from './types.js';

const SAMSARA_VERIFY_DAYS = 3; // Samsara has up to 72h data lag

interface BackdateOptions {
  clerkOrgId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
}

interface DayReport {
  date: string;
  success: boolean;
  verify: boolean;
  duration: number;
  results: SyncResult[];
  error?: string;
}

/** True if the date is within N calendar days of today (UTC date comparison). */
function isWithinVerifyWindow(date: string, days: number): boolean {
  const today = new Date().toISOString().split('T')[0];
  const cutoff = new Date(today);
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  return date >= cutoff.toISOString().split('T')[0];
}

/** Print a summary table: one row per endpoint. */
function printSummaryTable(days: DayReport[], label: string): void {
  const endpointTotals = new Map<string, { new: number; updated: number; unchanged: number; errors: number }>();

  for (const day of days) {
    for (const r of day.results) {
      const e = endpointTotals.get(r.endpoint) ?? { new: 0, updated: 0, unchanged: 0, errors: 0 };
      e.new += r.newCount;
      e.updated += r.updatedCount;
      e.unchanged += r.unchangedCount;
      e.errors += r.errorCount;
      endpointTotals.set(r.endpoint, e);
    }
  }

  const successDays = days.filter((d) => d.success).length;
  const errorDays = days.filter((d) => !d.success).length;

  console.log(`\n${'═'.repeat(72)}`);
  console.log(`  SAMSARA BACKFILL SUMMARY — ${label}`);
  console.log(`${'═'.repeat(72)}`);
  console.log(`  Days processed : ${days.length}  (${successDays} ok, ${errorDays} failed)`);
  console.log(`  Completed at   : ${new Date().toISOString()}`);
  console.log(`\n  ${'Endpoint'.padEnd(30)} ${'New'.padStart(7)} ${'Updated'.padStart(9)} ${'Unchanged'.padStart(11)} ${'Errors'.padStart(8)}`);
  console.log(`  ${'─'.repeat(67)}`);

  for (const [ep, t] of endpointTotals) {
    console.log(
      `  ${ep.padEnd(30)} ${String(t.new).padStart(7)} ${String(t.updated).padStart(9)} ` +
      `${String(t.unchanged).padStart(11)} ${String(t.errors).padStart(8)}`
    );
  }

  const failedDays = days.filter((d) => !d.success);
  if (failedDays.length > 0) {
    console.log(`\n  Failed dates:`);
    for (const d of failedDays) {
      console.log(`    ${d.date}: ${d.error ?? 'unknown error'}`);
    }
  }

  console.log(`${'═'.repeat(72)}\n`);
}

export async function backdateSamsaraData(options: BackdateOptions): Promise<void> {
  const { clerkOrgId, startDate, endDate } = options;

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  SAMSARA BACKDATE`);
  console.log(`  Org        : ${clerkOrgId}`);
  console.log(`  Range      : ${startDate} → ${endDate}`);
  console.log(`  Started at : ${new Date().toISOString()}`);
  console.log(`${'─'.repeat(60)}\n`);

  const providerAccount = await appPrisma.telematicsProviderAccount.findUnique({
    where: { clerkOrgId, provider: 'SAMSARA' },
  });

  if (!providerAccount) {
    throw new Error(`No Samsara provider account found for ${clerkOrgId}`);
  }
  if (providerAccount.status !== 'ACTIVE') {
    throw new Error(`Samsara account for ${clerkOrgId} is not ACTIVE (status: ${providerAccount.status})`);
  }

  const apiToken = readCredentials(providerAccount.credentialsJson).apiToken as string;
  if (!apiToken) throw new Error(`No API token in credentials for ${clerkOrgId}`);

  const dates = getDateRange(startDate, endDate);
  console.log(`  ${dates.length} days to process\n`);

  const dayReports: DayReport[] = [];

  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    const verify = isWithinVerifyWindow(date, SAMSARA_VERIFY_DAYS);
    const progress = `[${String(i + 1).padStart(String(dates.length).length)}/${dates.length}]`;
    const modeTag = verify ? ' (verify)' : '';

    try {
      const result = await syncSamsaraOrgForDate(clerkOrgId, apiToken, date, verify);

      const totalNew = result.results.reduce((s, r) => s + r.newCount, 0);
      const totalUpdated = result.results.reduce((s, r) => s + r.updatedCount, 0);
      const totalErrors = result.results.reduce((s, r) => s + r.errorCount, 0);

      const statusIcon = result.success ? '✓' : '✗';
      console.log(
        `  ${progress} ${date}${modeTag}  ${statusIcon}  ` +
        `new=${totalNew} updated=${totalUpdated} errors=${totalErrors}  ` +
        `(${Math.round(result.duration / 1000)}s)`
      );

      dayReports.push({
        date,
        success: result.success,
        verify,
        duration: result.duration,
        results: result.results,
        error: result.error,
      });
    } catch (err: any) {
      console.error(`  ${progress} ${date}${modeTag}  ✗  ${err.message}`);
      dayReports.push({ date, success: false, verify, duration: 0, results: [], error: err.message });
    }

    // Courtesy delay — avoids hammering Samsara API
    if (i < dates.length - 1) {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  const successCount = dayReports.filter((d) => d.success).length;
  const errorCount = dayReports.filter((d) => !d.success).length;
  const errors = dayReports.filter((d) => !d.success).map((d) => ({ date: d.date, error: d.error ?? 'unknown' }));

  // Write run report to DB
  await appPrisma.telematicsProviderAccount.update({
    where: { id: providerAccount.id },
    data: {
      lastError: errors.length > 0 ? `Backdate completed with ${errors.length} errors` : null,
      lastBackdateReport: {
        completedAt: new Date().toISOString(),
        startDate,
        endDate,
        totalDays: dates.length,
        successCount,
        errorCount,
        failedDates: errors,
      } as any,
    },
  });

  printSummaryTable(dayReports, `${clerkOrgId}  ${startDate} → ${endDate}`);
}

function parseArgs(): BackdateOptions {
  const args = process.argv.slice(2);
  const opts: Partial<BackdateOptions> = {};
  for (const arg of args) {
    if (arg.startsWith('--org=')) opts.clerkOrgId = arg.split('=')[1];
    else if (arg.startsWith('--start=')) opts.startDate = arg.split('=')[1];
    else if (arg.startsWith('--end=')) opts.endDate = arg.split('=')[1];
  }
  if (!opts.clerkOrgId) throw new Error('Missing --org=org_xxxxx');
  if (!opts.startDate) throw new Error('Missing --start=YYYY-MM-DD');
  if (!opts.endDate) throw new Error('Missing --end=YYYY-MM-DD');
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(opts.startDate) || !re.test(opts.endDate)) throw new Error('Dates must be YYYY-MM-DD');
  if (opts.startDate > opts.endDate) throw new Error('--start must be ≤ --end');
  return opts as BackdateOptions;
}

async function main() {
  try {
    const options = parseArgs();
    await backdateSamsaraData(options);
    process.exit(0);
  } catch (err: any) {
    console.error(`\n❌ ${err.message}`);
    process.exit(1);
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main();
