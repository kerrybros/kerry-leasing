/**
 * Diagnose driver miles gaps — find driver-days where motiveDriverUtilization
 * exists but motiveDriverPeriod records are missing, causing totalDistance = null
 * (shown as 0 miles in the WoW/MoM scorecard views).
 *
 * Usage:
 *   pnpm exec tsx src/scripts/diagnose-driver-miles-gaps.ts
 *
 * Override org or date range via env:
 *   ORG_ID=org_xxx START_DATE=2026-03-01 END_DATE=2026-04-30 \
 *     pnpm exec tsx src/scripts/diagnose-driver-miles-gaps.ts
 *
 * Default range: last 60 days.
 */

import 'dotenv/config';
import { getAppPrisma } from '../lib/prisma.js';

const ORG = process.env.ORG_ID ?? 'org_39B7lu1b8YKds8IOtzrk6LpKnLW';

function defaultDates(): { start: string; end: string } {
  const end = new Date();
  const start = new Date(end);
  start.setDate(end.getDate() - 60);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { start: fmt(start), end: fmt(end) };
}

const defaults = defaultDates();
const START = process.env.START_DATE ?? defaults.start;
const END   = process.env.END_DATE   ?? defaults.end;

async function main() {
  const app = getAppPrisma();

  console.log(`\nDriver miles gap report`);
  console.log(`Org:   ${ORG}`);
  console.log(`Range: ${START} → ${END}\n`);

  // 1. All driver utilization rows in range
  const utilRows = await app.motiveDriverUtilization.findMany({
    where: { clerkOrgId: ORG, date: { gte: START, lte: END }, driverId: { not: null } },
    select: { driverId: true, driverFirstName: true, driverLastName: true, date: true },
    orderBy: [{ driverId: 'asc' }, { date: 'asc' }],
  });

  if (utilRows.length === 0) {
    console.warn(`No driver utilization rows found for org ${ORG} between ${START} and ${END}.`);
    return;
  }

  // 2. All driving period rows in range (just driverId + date for presence check)
  const periodDates = new Set<string>();
  const periodRows = await app.motiveDrivingPeriod.findMany({
    where: { clerkOrgId: ORG, date: { gte: START, lte: END }, driverId: { not: null } },
    select: { driverId: true, date: true },
  });
  for (const p of periodRows) {
    if (p.driverId != null) periodDates.add(`${p.driverId}:${p.date}`);
  }

  // 3. Group by driver and identify gap dates
  type DriverStats = {
    driverId: number;
    driverName: string;
    totalDays: number;
    gapDates: string[];
  };

  const byDriver = new Map<number, DriverStats>();
  for (const r of utilRows) {
    const id = r.driverId!;
    const name = `${r.driverFirstName ?? ''} ${r.driverLastName ?? ''}`.trim() || `Driver ${id}`;
    if (!byDriver.has(id)) byDriver.set(id, { driverId: id, driverName: name, totalDays: 0, gapDates: [] });
    const stats = byDriver.get(id)!;
    stats.totalDays++;
    if (!periodDates.has(`${id}:${r.date}`)) stats.gapDates.push(r.date);
  }

  // 4. Print results
  const allStats = Array.from(byDriver.values()).sort((a, b) => b.gapDates.length - a.gapDates.length);

  const withGaps = allStats.filter(s => s.gapDates.length > 0);
  const clean    = allStats.filter(s => s.gapDates.length === 0);

  const totalDriverDays = allStats.reduce((n, s) => n + s.totalDays, 0);
  const totalGapDays    = allStats.reduce((n, s) => n + s.gapDates.length, 0);

  if (withGaps.length === 0) {
    console.log(`✅ No gaps found — all ${totalDriverDays} driver-days have driving period records.\n`);
    return;
  }

  console.log(`⚠️  GAPS FOUND\n`);
  console.log(
    'Driver'.padEnd(28) +
    'Active days'.padStart(12) +
    'Gap days'.padStart(10) +
    'Coverage'.padStart(10)
  );
  console.log('-'.repeat(62));

  for (const s of withGaps) {
    const coverage = ((1 - s.gapDates.length / s.totalDays) * 100).toFixed(1) + '%';
    console.log(
      s.driverName.slice(0, 27).padEnd(28) +
      String(s.totalDays).padStart(12) +
      String(s.gapDates.length).padStart(10) +
      coverage.padStart(10)
    );
    // Print gap dates grouped into runs for readability
    const grouped = groupDates(s.gapDates);
    for (const g of grouped) console.log(`  → ${g}`);
  }

  console.log('-'.repeat(62));
  const overallCoverage = ((1 - totalGapDays / totalDriverDays) * 100).toFixed(1);
  console.log(
    'TOTAL'.padEnd(28) +
    String(totalDriverDays).padStart(12) +
    String(totalGapDays).padStart(10) +
    `${overallCoverage}%`.padStart(10)
  );

  if (clean.length > 0) {
    console.log(`\n✅ ${clean.length} driver(s) have complete data for all active days.`);
  }

  // 5. Summarise affected date range (to help target a backdate re-sync)
  const allGapDates = withGaps.flatMap(s => s.gapDates).sort();
  const uniqueGapDates = [...new Set(allGapDates)];
  console.log(`\nAffected dates (${uniqueGapDates.length} unique):`);
  console.log(groupDates(uniqueGapDates).map(g => `  ${g}`).join('\n'));

  console.log(`\nTo re-sync a specific date across all orgs, run:`);
  console.log(`  ORG_ID=${ORG} pnpm exec tsx src/cron/sync-motive-daily.ts --date <YYYY-MM-DD>\n`);
}

/**
 * Converts a sorted list of YYYY-MM-DD strings into human-readable ranges.
 * e.g. ["2026-04-01","2026-04-02","2026-04-03","2026-04-07"] →
 *      ["2026-04-01 – 2026-04-03", "2026-04-07"]
 */
function groupDates(sorted: string[]): string[] {
  if (sorted.length === 0) return [];
  const ranges: string[] = [];
  let rangeStart = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    const curr = sorted[i];
    const prevMs = new Date(prev + 'T00:00:00').getTime();
    const currMs = new Date(curr + 'T00:00:00').getTime();
    if (currMs - prevMs === 86_400_000) {
      prev = curr;
    } else {
      ranges.push(rangeStart === prev ? rangeStart : `${rangeStart} – ${prev}`);
      rangeStart = curr;
      prev = curr;
    }
  }
  ranges.push(rangeStart === prev ? rangeStart : `${rangeStart} – ${prev}`);
  return ranges;
}

main().catch(e => { console.error(e); process.exit(1); });
