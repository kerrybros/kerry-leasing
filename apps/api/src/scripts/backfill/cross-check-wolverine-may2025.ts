import 'dotenv/config';
import { appPrisma } from '../../lib/prisma.js';

// ── CSV reference data (Motive dashboard export, May 1–31 2025) ──────────────

const vehicleCSV: Record<string, { dist: number; fuel: number; drivingMin: number; idleMin: number; idleFuel: number }> = {
  '2225': { dist: 268.43,  fuel:  27.60, drivingMin:  264.37, idleMin:   36.26, idleFuel:  0.33 },
  '2241': { dist: 274.02,  fuel:  28.53, drivingMin:  281.98, idleMin:   43.19, idleFuel:  0.35 },
  '2185': { dist: 6372.16, fuel: 901.85, drivingMin: 7266.42, idleMin: 5886.10, idleFuel: 52.32 },
  '2166': { dist:   5.59,  fuel:   0.82, drivingMin:   15.45, idleMin:    2.00, idleFuel:  0.04 },
  '2173': { dist: 282.10,  fuel:  44.14, drivingMin:  595.46, idleMin:  273.17, idleFuel:  3.13 },
  '2181': { dist: 1824.35, fuel: 286.99, drivingMin: 2970.19, idleMin: 2558.12, idleFuel: 30.25 },
  '2222': { dist:  14.29,  fuel:   2.32, drivingMin:   22.00, idleMin:   12.80, idleFuel:  0.22 },
  '113':  { dist:  18.64,  fuel:   4.59, drivingMin:  118.42, idleMin:   35.92, idleFuel:  0.49 },
  '110':  { dist:  32.31,  fuel:  11.67, drivingMin:  240.76, idleMin:  491.53, idleFuel:  5.17 },
  '2201': { dist:   0.00,  fuel:   0.08, drivingMin:    1.40, idleMin:    4.54, idleFuel:  0.05 },
  '2175': { dist:   0.00,  fuel:   0.05, drivingMin:    0.00, idleMin:    4.50, idleFuel:  0.05 },
  '2202': { dist:   0.00,  fuel:   0.00, drivingMin:    0.28, idleMin:    0.00, idleFuel:  0.00 },
};

// Only 3 drivers had attributed trips in May 2025
const driverCSV: Record<string, { vehicle: string; dist: number; fuel: number; drivingMin: number; idleMin: number }> = {
  'Steve Moore':    { vehicle: '2225', dist: 268.43, fuel: 27.50, drivingMin: 264.37, idleMin:  27.55 },
  'Walter Brown':   { vehicle: '2241', dist: 268.43, fuel: 27.72, drivingMin: 269.51, idleMin:  22.30 },
  'Ken Hardnett':   { vehicle: '2166', dist:   5.59, fuel:  0.82, drivingMin:  15.45, idleMin:   2.00 },
};

// ── DB queries ────────────────────────────────────────────────────────────────

const vehicleRows = await appPrisma.motiveVehicleUtilization.groupBy({
  by: ['vehicleNumber'],
  where: {
    clerkOrgId: 'org_39B7lu1b8YKds8IOtzrk6LpKnLW',
    date: { gte: '2025-05-01', lte: '2025-05-31' },
    vehicleNumber: { not: null },
  },
  _sum: {
    totalDistance: true,
    totalFuel: true,
    drivingTime: true,
    idleTime: true,
    idleFuel: true,
  },
  orderBy: { vehicleNumber: 'asc' },
});

const driverRows = await appPrisma.motiveDriverUtilization.groupBy({
  by: ['driverFirstName', 'driverLastName'],
  where: {
    clerkOrgId: 'org_39B7lu1b8YKds8IOtzrk6LpKnLW',
    date: { gte: '2025-05-01', lte: '2025-05-31' },
    driverFirstName: { not: null },
  },
  _sum: {
    drivingTime: true,
    idleTime: true,
    drivingFuel: true,
    idleFuel: true,
  },
  orderBy: { driverLastName: 'asc' },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const pct = (db: number, ref: number): string => {
  if (ref === 0 && db === 0) return 'n/a';
  if (ref === 0) return '+∞';
  return `${((db - ref) / ref * 100).toFixed(1)}%`;
};
const flag = (d: string): string => {
  if (d === 'n/a' || d === '+∞') return '';
  return Math.abs(parseFloat(d)) > 5 ? ' ⚠' : '';
};
const h = (s: string, w: number) => String(s).padStart(w);

// ── Vehicle cross-check ───────────────────────────────────────────────────────

console.log('\nWolverine — Motive Vehicle Utilization: May 2025 Cross-Check');
console.log('='.repeat(108));
console.log(
  h('Vehicle', 8) +
  h('DB Miles', 10) + h('CSV Miles', 10) + h('Δ', 7) +
  h('DB Fuel', 9)  + h('CSV Fuel', 9)  + h('Δ', 7) +
  h('DB DrvMin', 11) + h('CSV DrvMin', 11) + h('Δ', 7) +
  h('DB IdlMin', 11) + h('CSV IdlMin', 11) + h('Δ', 7)
);
console.log('-'.repeat(108));

let vehicleAllOk = true;

// Only print vehicles that appear in the dashboard CSV (skip zero-activity fleet units)
for (const [vNum, ref] of Object.entries(vehicleCSV)) {
  const row = vehicleRows.find((r) => r.vehicleNumber === vNum);
  const dbDist     = Number((row?._sum.totalDistance ?? 0).toFixed(2));
  const dbFuel     = Number((row?._sum.totalFuel     ?? 0).toFixed(2));
  const dbDrvMin   = Number((row?._sum.drivingTime   ?? 0).toFixed(1));
  const dbIdlMin   = Number((row?._sum.idleTime      ?? 0).toFixed(1));

  const dDist  = pct(dbDist,   ref.dist);
  const dFuel  = pct(dbFuel,   ref.fuel);
  const dDrv   = pct(dbDrvMin, ref.drivingMin);
  const dIdle  = pct(dbIdlMin, ref.idleMin);

  const rowOk = [dDist, dFuel, dDrv, dIdle].every(
    (d) => d === 'n/a' || d === '+∞' || Math.abs(parseFloat(d)) <= 5
  );
  if (!rowOk) vehicleAllOk = false;

  console.log(
    h(vNum,     8) +
    h(String(dbDist),   10) + h(String(ref.dist),       10) + h(dDist  + flag(dDist),  7) +
    h(String(dbFuel),    9) + h(String(ref.fuel),         9) + h(dFuel  + flag(dFuel),  7) +
    h(String(dbDrvMin), 11) + h(String(ref.drivingMin),  11) + h(dDrv   + flag(dDrv),   7) +
    h(String(dbIdlMin), 11) + h(String(ref.idleMin),     11) + h(dIdle  + flag(dIdle),  7)
  );
}

// Fleet totals
const totDB = vehicleRows.reduce((s, r) => ({
  dist: s.dist + (r._sum.totalDistance ?? 0),
  fuel: s.fuel + (r._sum.totalFuel ?? 0),
  drv:  s.drv  + (r._sum.drivingTime ?? 0),
  idle: s.idle + (r._sum.idleTime    ?? 0),
}), { dist: 0, fuel: 0, drv: 0, idle: 0 });

const totCSV = Object.values(vehicleCSV).reduce((s, r) => ({
  dist: s.dist + r.dist,
  fuel: s.fuel + r.fuel,
  drv:  s.drv  + r.drivingMin,
  idle: s.idle + r.idleMin,
}), { dist: 0, fuel: 0, drv: 0, idle: 0 });

console.log('='.repeat(108));
console.log(
  h('TOTAL', 8) +
  h(totDB.dist.toFixed(2), 10) + h(totCSV.dist.toFixed(2), 10) + h(pct(totDB.dist, totCSV.dist), 7) +
  h(totDB.fuel.toFixed(2),  9) + h(totCSV.fuel.toFixed(2),  9) + h(pct(totDB.fuel, totCSV.fuel), 7) +
  h(totDB.drv.toFixed(1),  11) + h(totCSV.drv.toFixed(1),  11) + h(pct(totDB.drv, totCSV.drv),   7) +
  h(totDB.idle.toFixed(1), 11) + h(totCSV.idle.toFixed(1), 11) + h(pct(totDB.idle, totCSV.idle), 7)
);
console.log('\n' + (vehicleAllOk ? '✅  All vehicles within ±5% tolerance.' : '⚠️   One or more vehicles exceed ±5%.'));

// ── Driver cross-check ────────────────────────────────────────────────────────

console.log('\n\nWolverine — Motive Driver Utilization: May 2025 Cross-Check');
console.log('='.repeat(90));
console.log(
  h('Driver', 18) +
  h('DB DrvMin', 12) + h('CSV DrvMin', 12) + h('Δ', 8) +
  h('DB Fuel', 10)  + h('CSV Fuel', 10)  + h('Δ', 8) +
  h('DB IdlMin', 12) + h('CSV IdlMin', 12)
);
console.log('-'.repeat(90));

let driverAllOk = true;

for (const [name, ref] of Object.entries(driverCSV)) {
  const [first, ...lastParts] = name.split(' ');
  const last = lastParts.join(' ');
  const row = driverRows.find(
    (r) => r.driverFirstName?.toLowerCase() === first.toLowerCase() &&
            r.driverLastName?.toLowerCase()  === last.toLowerCase()
  );

  // drivingTime stored as seconds in driver util → convert to minutes
  const dbDrvMin = Number(((row?._sum.drivingTime ?? 0) / 60).toFixed(1));
  const dbFuel   = Number(((row?._sum.drivingFuel ?? 0) + (row?._sum.idleFuel ?? 0)).toFixed(2));
  const dbIdlMin = Number(((row?._sum.idleTime    ?? 0) / 60).toFixed(1));

  const dDrv  = pct(dbDrvMin, ref.drivingMin);
  const dFuel = pct(dbFuel,   ref.fuel);

  const rowOk = [dDrv, dFuel].every((d) => d === 'n/a' || Math.abs(parseFloat(d)) <= 10);
  if (!rowOk) driverAllOk = false;

  const noData = !row ? '  (no DB record)' : '';
  console.log(
    h(name, 18) +
    h(String(dbDrvMin), 12) + h(String(ref.drivingMin), 12) + h(dDrv  + flag(dDrv),  8) +
    h(String(dbFuel),   10) + h(String(ref.fuel),       10) + h(dFuel + flag(dFuel), 8) +
    h(String(dbIdlMin), 12) + h(String(ref.idleMin),    12) + noData
  );
}

console.log('='.repeat(90));
console.log('\nNote: Motive driver utilization API returns sparse daily records for this org.');
console.log('Driver data completeness is expected to improve as the fleet uses ELD consistently.\n');

await appPrisma.$disconnect();
