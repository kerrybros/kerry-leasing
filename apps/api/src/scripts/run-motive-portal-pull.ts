/**
 * Motive portal pull, cron entrypoint. Logs into the Fleet Dashboard as each
 * org's dedicated portal user and (re)pulls Driver Fuel Performance for the
 * last 14 days, last 2 weeks, and the current/prior month. See portalPull.ts.
 *
 *   pnpm exec tsx src/scripts/run-motive-portal-pull.ts [--dry-run] [--only-org=<id>] [--window=YYYY-MM-DD..YYYY-MM-DD]
 *   pnpm exec tsx src/scripts/run-motive-portal-pull.ts --at-et-hour=6,9
 *
 * --at-et-hour makes the schedule daylight-saving proof. Render schedules in
 * UTC, so a fixed UTC time moves an hour when the clocks change: 13:00 UTC is
 * 09:00 EDT today and 08:00 EST from 2026-11-01, which would drag the pull into
 * the window where Motive's overnight batch has not reliably finished. The cron
 * fires at both candidate UTC hours for each wanted ET hour and this gate lets
 * through only the right one, so exactly the intended runs happen year round.
 */
import { runPortalPull, type PullWindow } from '../features/motiveReport/portalPull.js';
import { recordTelematicsCronRun } from '../lib/telematicsCronRun.js';
import { CronJobType } from '../generated/app-client/index.js';

/** Current hour in Eastern, 0 to 23. */
function etHour(d: Date): number {
  return parseInt(
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }).format(d),
    10,
  );
}

async function main() {
  const atEtHour = process.argv.find((a) => a.startsWith('--at-et-hour='))?.split('=')[1];
  if (atEtHour) {
    const wanted = atEtHour.split(',').map((h) => parseInt(h.trim(), 10)).filter(Number.isFinite);
    const now = etHour(new Date());
    if (!wanted.includes(now)) {
      console.log(`[motive-portal] ${now}:00 ET is not a pull hour (${wanted.join(', ')}). Nothing to do.`);
      process.exit(0);
    }
  }
  const dryRun = process.argv.includes('--dry-run');
  const onlyOrgId = process.argv.find((a) => a.startsWith('--only-org='))?.split('=')[1];
  const windows: PullWindow[] = process.argv
    .filter((a) => a.startsWith('--window='))
    .map((a) => { const [s, e] = a.split('=')[1].split('..'); return { windowStart: s, windowEnd: e ?? s }; });

  console.log(`[motive-portal] pull starting ${new Date().toISOString()} dryRun=${dryRun}`);
  const s = await runPortalPull({ dryRun, onlyOrgId, windows: windows.length ? windows : undefined });
  for (const r of s.results) {
    console.log(`org=${r.clerkOrgId} success=${r.success}${r.error ? ` :: ${r.error}` : ''} (${r.duration}ms)`);
    for (const w of r.windows) {
      const miss = w.missingFromReport.length ? ` missing=[${w.missingFromReport.join('; ')}]` : '';
      console.log(`  ${w.status.padEnd(10)} ${w.windowStart}..${w.windowEnd} rows=${String(w.rowCount).padStart(3)} drivers=${String(w.driversInReport).padStart(2)}/${w.driversActiveInApi} active${miss}${w.error && w.status === 'error' ? ` :: ${w.error}` : ''}`);
    }
  }
  console.log(`[motive-portal] orgs=${s.totalOrgs} ok=${s.successCount} failed=${s.errorCount} in ${s.duration}ms`);
  if (!dryRun && s.totalOrgs > 0) {
    await recordTelematicsCronRun(CronJobType.MOTIVE_REPORT_INGEST, {
      totalOrgs: s.totalOrgs, successCount: s.successCount, errorCount: s.errorCount, duration: s.duration,
      results: s.results.map((r) => ({
        clerkOrgId: r.clerkOrgId, success: r.success, date: r.windows[0]?.windowStart ?? '', verify: true, duration: r.duration, error: r.error,
        results: r.windows.map((w) => ({
          endpoint: `portal:${w.windowStart}..${w.windowEnd}`, date: w.windowStart, recordCount: w.rowCount,
          newCount: w.status === 'stored' ? w.rowCount : 0, updatedCount: 0, unchangedCount: 0,
          errorCount: w.status === 'stored' ? 0 : 1,
        })),
      })),
    });
  }
  process.exit(s.errorCount > 0 ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
