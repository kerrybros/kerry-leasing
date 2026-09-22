/**
 * Motive portal pull, cron entrypoint. Logs into the Fleet Dashboard as each
 * org's dedicated portal user and (re)pulls Driver Fuel Performance for the
 * last 14 days, last 2 weeks, and the current/prior month. See portalPull.ts.
 *
 *   pnpm exec tsx src/scripts/run-motive-portal-pull.ts [--dry-run] [--only-org=<id>] [--window=YYYY-MM-DD..YYYY-MM-DD]
 */
import { runPortalPull, type PullWindow } from '../features/motiveReport/portalPull.js';
import { recordTelematicsCronRun } from '../lib/telematicsCronRun.js';
import { CronJobType } from '../generated/app-client/index.js';

async function main() {
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
