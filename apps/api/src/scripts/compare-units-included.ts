/**
 * Compare which units (vehicles) are included in our January data vs Motive report.
 *
 * Usage:
 *   pnpm exec tsx src/scripts/compare-units-included.ts
 *     → Prints our unit list and total driving for January.
 *
 *   pnpm exec tsx src/scripts/compare-units-included.ts motive-report.csv
 *     → Compares unit lists: in both, only in ours, only in Motive; and driving totals per set.
 */

import 'dotenv/config';
import { getAppPrisma } from '../lib/prisma.js';
import { readFileSync } from 'fs';

const ORG = 'org_39B7lu1b8YKds8IOtzrk6LpKnLW';
const START = '2026-01-01';
const END = '2026-01-31';

type OurUnit = { vehicleNumber: string; drivingMinutes: number; idlingMinutes: number };

async function getOurUnits(): Promise<OurUnit[]> {
  const app = getAppPrisma();
  const rows = await app.motiveVehicleUtilization.findMany({
    where: { clerkOrgId: ORG, date: { gte: START, lte: END } },
    select: { vehicleNumber: true, vehicleId: true, drivingTime: true, idleTime: true },
  });

  const byVehicle = new Map<string, { drivingSec: number; idleSec: number }>();
  for (const r of rows) {
    const key = (r.vehicleNumber ?? String(r.vehicleId)).trim();
    const cur = byVehicle.get(key) ?? { drivingSec: 0, idleSec: 0 };
    cur.drivingSec += r.drivingTime ?? 0;
    cur.idleSec += r.idleTime ?? 0;
    byVehicle.set(key, cur);
  }

  return Array.from(byVehicle.entries()).map(([vehicleNumber, agg]) => ({
    vehicleNumber,
    drivingMinutes: Math.round((agg.drivingSec / 60) * 100) / 100,
    idlingMinutes: Math.round((agg.idleSec / 60) * 100) / 100,
  }));
}

function getMotiveUnitsFromCsv(csvPath: string): Set<string> {
  const text = readFileSync(csvPath, 'utf-8');
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return new Set();

  const header = lines[0];
  const vehicleCol = header.split(',').findIndex((c) => c.toLowerCase().includes('vehicle'));
  if (vehicleCol < 0) throw new Error('CSV must have a Vehicle column');

  const sep = header.includes(';') ? ';' : ',';
  const set = new Set<string>();
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(sep).map((p) => p.replace(/^"|"$/g, '').trim());
    const vehicle = (parts[vehicleCol] ?? '').trim();
    if (vehicle) set.add(vehicle);
  }
  return set;
}

async function main() {
  const ourUnits = await getOurUnits();
  ourUnits.sort((a, b) => a.vehicleNumber.localeCompare(b.vehicleNumber, undefined, { numeric: true }));

  const ourSet = new Set(ourUnits.map((u) => u.vehicleNumber));
  const ourDrivingByUnit = new Map(ourUnits.map((u) => [u.vehicleNumber, u.drivingMinutes]));

  if (!process.argv[2]) {
    console.log('\n--- Units included in OUR data (January 2026) ---\n');
    console.log('Count:', ourUnits.length);
    console.log('Vehicle numbers:', ourUnits.map((u) => u.vehicleNumber).join(', '));
    console.log('\nTotal driving (all units):', Math.round(ourUnits.reduce((s, u) => s + u.drivingMinutes, 0)), 'min');
    console.log('\nTo compare with Motive: export Vehicle Utilization report to CSV, then run:');
    console.log('  pnpm exec tsx src/scripts/compare-units-included.ts <path-to.csv>\n');
    return;
  }

  const motiveSet = getMotiveUnitsFromCsv(process.argv[2]);
  const inBoth = [...ourSet].filter((v) => motiveSet.has(v));
  const onlyOurs = [...ourSet].filter((v) => !motiveSet.has(v));
  const onlyMotive = [...motiveSet].filter((v) => !ourSet.has(v));

  const drivingInBoth = inBoth.reduce((s, v) => s + (ourDrivingByUnit.get(v) ?? 0), 0);
  const drivingOnlyOurs = onlyOurs.reduce((s, v) => s + (ourDrivingByUnit.get(v) ?? 0), 0);

  console.log('\n========== UNIT INCLUSION COMPARISON (January 2026) ==========\n');
  console.log('OUR data (vehicle utilization API):', ourSet.size, 'units');
  console.log('MOTIVE report (from CSV):', motiveSet.size, 'units');
  console.log('');
  console.log('In BOTH (in our data AND in Motive report):', inBoth.length, 'units');
  console.log('  Units:', inBoth.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).join(', '));
  console.log('  Our driving total (these units only):', Math.round(drivingInBoth), 'min');
  console.log('');
  console.log('Only in OURS (in our data, NOT in Motive report):', onlyOurs.length, 'units');
  console.log('  Units:', onlyOurs.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).join(', '));
  console.log('  Our driving total (these units):', Math.round(drivingOnlyOurs), 'min');
  console.log('');
  console.log('Only in MOTIVE (in Motive report, NOT in our data):', onlyMotive.length, 'units');
  if (onlyMotive.length > 0) {
    console.log('  Units:', onlyMotive.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).join(', '));
  }
  console.log('');
  console.log('Summary:');
  console.log('  If Motive report excludes', onlyOurs.length, 'units that we include, our total is higher by the driving from those units.');
  console.log('  Extra driving from "only ours" units:', Math.round(drivingOnlyOurs), 'min');
  console.log('\n========== END ==========\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
