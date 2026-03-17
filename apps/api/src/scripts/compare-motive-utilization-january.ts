/**
 * Compare our January driving time (and idling) to Motive Vehicle Utilization Report, unit by unit.
 *
 * Usage:
 *   pnpm exec tsx src/scripts/compare-motive-utilization-january.ts
 *     → Prints our totals per vehicle for Jan 2026; paste Motive report or use CSV.
 *
 *   pnpm exec tsx src/scripts/compare-motive-utilization-january.ts motive-report.csv
 *     → Expects CSV with header row and columns: Vehicle (number), Driving Tir (or "Driving Time"),
 *        Idling Tim (or "Idling Time"). Prints side-by-side and per-unit difference.
 */

import 'dotenv/config';
import { getAppPrisma } from '../lib/prisma.js';
import { readFileSync, writeFileSync } from 'fs';

const ORG = 'org_39B7lu1b8YKds8IOtzrk6LpKnLW';
const START = '2026-01-01';
const END = '2026-01-31';

type OurRow = {
  vehicleNumber: string | null;
  vehicleId: number;
  drivingMinutes: number;
  idlingMinutes: number;
  days: number;
};

async function getOurData(): Promise<OurRow[]> {
  const app = getAppPrisma();
  const rows = await app.motiveVehicleUtilization.findMany({
    where: { clerkOrgId: ORG, date: { gte: START, lte: END } },
    select: {
      vehicleNumber: true,
      vehicleId: true,
      drivingTime: true,
      idleTime: true,
    },
  });

  const byVehicle = new Map<string, { drivingSec: number; idleSec: number; days: number }>();
  for (const r of rows) {
    const key = (r.vehicleNumber ?? String(r.vehicleId)).trim();
    const cur = byVehicle.get(key) ?? { drivingSec: 0, idleSec: 0, days: 0 };
    cur.drivingSec += r.drivingTime ?? 0;
    cur.idleSec += r.idleTime ?? 0;
    cur.days += 1;
    byVehicle.set(key, cur);
  }

  return Array.from(byVehicle.entries()).map(([vehicleNumber, agg]) => ({
    vehicleNumber,
    vehicleId: rows.find((r) => (r.vehicleNumber ?? String(r.vehicleId)).trim() === vehicleNumber)!.vehicleId,
    drivingMinutes: Math.round((agg.drivingSec / 60) * 100) / 100,
    idlingMinutes: Math.round((agg.idleSec / 60) * 100) / 100,
    days: agg.days,
  }));
}

function parseMotiveCsv(csvPath: string): Map<string, { drivingMinutes: number; idlingMinutes: number }> {
  const text = readFileSync(csvPath, 'utf-8');
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return new Map();

  const header = lines[0].toLowerCase();
  const drivingCol = header.includes('driving tir')
    ? lines[0].split(',').findIndex((c) => c.toLowerCase().includes('driving tir'))
    : header.includes('driving time')
      ? lines[0].split(',').findIndex((c) => c.toLowerCase().includes('driving time'))
      : -1;
  const idlingCol = header.includes('idling tim')
    ? lines[0].split(',').findIndex((c) => c.toLowerCase().includes('idling tim'))
    : header.includes('idling time')
      ? lines[0].split(',').findIndex((c) => c.toLowerCase().includes('idling time'))
      : -1;
  const vehicleCol = lines[0].split(',').findIndex((c) => c.toLowerCase().includes('vehicle'));
  if (vehicleCol < 0) throw new Error('CSV must have a Vehicle column');

  const sep = lines[0].includes(';') ? ';' : ',';
  const map = new Map<string, { drivingMinutes: number; idlingMinutes: number }>();
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(sep).map((p) => p.replace(/^"|"$/g, '').trim());
    const vehicle = parts[vehicleCol] ?? '';
    if (!vehicle) continue;
    const drivingMinutes = drivingCol >= 0 ? parseFloat(parts[drivingCol] ?? '0') || 0 : 0;
    const idlingMinutes = idlingCol >= 0 ? parseFloat(parts[idlingCol] ?? '0') || 0 : 0;
    map.set(vehicle, { drivingMinutes, idlingMinutes });
  }
  return map;
}

async function main() {
  const csvArg = process.argv[2];
  const ourRows = await getOurData();
  ourRows.sort((a, b) => String(a.vehicleNumber).localeCompare(String(b.vehicleNumber), undefined, { numeric: true }));

  if (!csvArg) {
    console.log('\n--- Our data: January 2026 Vehicle Utilization (by vehicle) ---\n');
    console.log('Vehicle\tOur Driving (min)\tOur Idling (min)\tDays');
    console.log('-'.repeat(60));
    let totalDriving = 0,
      totalIdling = 0;
    for (const r of ourRows) {
      console.log(`${r.vehicleNumber}\t${r.drivingMinutes}\t${r.idlingMinutes}\t${r.days}`);
      totalDriving += r.drivingMinutes;
      totalIdling += r.idlingMinutes;
    }
    console.log('-'.repeat(60));
    console.log(`Total (${ourRows.length} vehicles)\t${Math.round(totalDriving)}\t${Math.round(totalIdling)}`);
    console.log('\nExport Motive report to CSV and run: pnpm exec tsx src/scripts/compare-motive-utilization-january.ts <path-to.csv>');
    return;
  }

  const motive = parseMotiveCsv(csvArg);
  console.log('\n--- Unit-by-unit comparison: Our data vs Motive report (January 2026) ---\n');
  console.log('Vehicle\tMotive Driving (min)\tOur Driving (min)\tDiff (min)\tMotive Idling\tOur Idling\tIdle Diff');
  console.log('-'.repeat(100));

  let totalMotiveDriving = 0,
    totalOurDriving = 0,
    totalMotiveIdling = 0,
    totalOurIdling = 0;
  const onlyUs: OurRow[] = [];
  const onlyMotive: string[] = [];
  const comparisonRows: string[] = [];

  for (const r of ourRows) {
    const m = motive.get(r.vehicleNumber ?? '');
    if (!m) {
      onlyUs.push(r);
      continue;
    }
    const diff = r.drivingMinutes - m.drivingMinutes;
    const idleDiff = r.idlingMinutes - m.idlingMinutes;
    const line = `${r.vehicleNumber}\t${m.drivingMinutes}\t${r.drivingMinutes}\t${diff.toFixed(2)}\t${m.idlingMinutes}\t${r.idlingMinutes}\t${idleDiff.toFixed(2)}`;
    console.log(line);
    comparisonRows.push(line.replace(/\t/g, ','));
    totalMotiveDriving += m.drivingMinutes;
    totalOurDriving += r.drivingMinutes;
    totalMotiveIdling += m.idlingMinutes;
    totalOurIdling += r.idlingMinutes;
    motive.delete(r.vehicleNumber ?? '');
  }
  onlyMotive.push(...motive.keys());

  const outCsv = 'january-unit-comparison.csv';
  const csvHeader = 'Vehicle,Motive Driving (min),Our Driving (min),Diff (min),Motive Idling (min),Our Idling (min),Idle Diff (min)';
  writeFileSync(outCsv, csvHeader + '\n' + comparisonRows.join('\n') + '\n', 'utf-8');
  console.log('\n(Written to ' + outCsv + ')');

  console.log('-'.repeat(100));
  console.log(
    `Totals (matched vehicles)\t${Math.round(totalMotiveDriving)}\t${Math.round(totalOurDriving)}\t${(totalOurDriving - totalMotiveDriving).toFixed(2)}\t${Math.round(totalMotiveIdling)}\t${Math.round(totalOurIdling)}\t${(totalOurIdling - totalMotiveIdling).toFixed(2)}`
  );
  if (onlyUs.length) console.log('\nIn our data only (no Motive row):', onlyUs.map((r) => r.vehicleNumber).join(', '));
  if (onlyMotive.length) console.log('In Motive only (no our row):', onlyMotive.join(', '));
  console.log('');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
