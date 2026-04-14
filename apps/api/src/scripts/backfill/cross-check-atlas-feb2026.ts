import 'dotenv/config';
import { appPrisma } from '../../lib/prisma.js';

const rows = await appPrisma.samsaraVehicleUtilization.groupBy({
  by: ['vehicleName'],
  where: {
    clerkOrgId: 'org_39RQY3qNO861ScQb0ZLFSUIFZkN',
    date: { gte: '2026-02-01', lte: '2026-02-28' },
  },
  _sum: {
    distanceMiles: true,
    fuelGallons: true,
    engineOnMinutes: true,
    idleMinutes: true,
  },
  orderBy: { vehicleName: 'asc' },
});

// CSV from Samsara dashboard (Feb 1–28 2026)
const csv: Record<string, { dist: number; fuel: number; engineMin: number; idleMin: number }> = {
  '140':  { dist: 2360.88, fuel: 301.94, engineMin: 8070.15, idleMin: 4012.98 },
  '825':  { dist: 2182.64, fuel: 270.53, engineMin: 6967.28, idleMin: 3066.62 },
  '823':  { dist: 1073.73, fuel: 148.98, engineMin: 2574.95, idleMin:  856.28 },
  '31':   { dist: 1187.53, fuel: 197.05, engineMin: 6381.27, idleMin: 3827.07 },
  '54':   { dist: 1920.09, fuel: 307.68, engineMin: 7298.43, idleMin: 3534.78 },
  '52':   { dist:    0.01, fuel:   0.13, engineMin:    1.84, idleMin:    0.00 },
  '826':  { dist: 1472.01, fuel: 205.22, engineMin: 8767.15, idleMin: 5627.66 },
  '354':  { dist: 1270.87, fuel: 171.43, engineMin: 5601.05, idleMin: 2830.53 },
  '824':  { dist: 3548.26, fuel: 401.38, engineMin: 7024.50, idleMin: 1489.05 },
  '205':  { dist: 2226.92, fuel: 284.09, engineMin: 6440.49, idleMin: 2258.72 },
  '078':  { dist: 1960.27, fuel: 244.21, engineMin: 6486.63, idleMin: 2622.34 },
  '48':   { dist:  839.95, fuel: 120.58, engineMin: 3487.94, idleMin: 1775.73 },
  '387':  { dist: 4727.20, fuel: 367.82, engineMin: 8078.10, idleMin: 2116.77 },
};

const pct = (a: number, b: number) => b === 0 ? 'n/a' : `${((a - b) / b * 100).toFixed(1)}%`;

const W = { v: 8, n: 10, d: 10, fd: 8, e: 10, fe: 8, im: 10, fi: 8 };
const h = (s: string, w: number) => s.padStart(w);

console.log('\nAtlas Wholesale — Samsara Feb 2026 Cross-Check (DB vs Dashboard CSV)');
console.log('='.repeat(100));
console.log(
  h('Vehicle', W.v) +
  h('DB Miles', W.d) + h('CSV Miles', W.n) + h('Δ Miles', W.fd) +
  h('DB Fuel', W.e) + h('CSV Fuel', W.fe) + h('Δ Fuel', W.fd) +
  h('DB Idle', W.im) + h('CSV Idle', W.fe) + h('Δ Idle', W.fd)
);
console.log('-'.repeat(100));

let allOk = true;

for (const row of rows) {
  const name = row.vehicleName ?? '?';
  const ref = csv[name];
  if (!ref) {
    console.log(h(name, W.v) + '  (no CSV reference)');
    continue;
  }

  const dbDist = Number((row._sum.distanceMiles ?? 0).toFixed(2));
  const dbFuel = Number((row._sum.fuelGallons ?? 0).toFixed(2));
  const dbIdle = Number((row._sum.idleMinutes ?? 0).toFixed(2));

  const dDist = pct(dbDist, ref.dist);
  const dFuel = pct(dbFuel, ref.fuel);
  const dIdle = pct(dbIdle, ref.idleMin);

  const flag = (d: string) => {
    if (d === 'n/a') return '';
    const v = Math.abs(parseFloat(d));
    return v > 5 ? ' ⚠' : '';
  };

  const ok = [dDist, dFuel, dIdle].every((d) => d === 'n/a' || Math.abs(parseFloat(d)) <= 5);
  if (!ok) allOk = false;

  console.log(
    h(name, W.v) +
    h(String(dbDist), W.d) + h(String(ref.dist), W.n) + h(dDist + flag(dDist), W.fd) +
    h(String(dbFuel), W.e) + h(String(ref.fuel), W.fe) + h(dFuel + flag(dFuel), W.fd) +
    h(String(dbIdle), W.im) + h(String(ref.idleMin), W.fe) + h(dIdle + flag(dIdle), W.fd)
  );
}

console.log('='.repeat(100));

// Fleet totals
const totDB = rows.reduce((s, r) => ({
  dist: s.dist + (r._sum.distanceMiles ?? 0),
  fuel: s.fuel + (r._sum.fuelGallons ?? 0),
  idle: s.idle + (r._sum.idleMinutes ?? 0),
}), { dist: 0, fuel: 0, idle: 0 });

const totCSV = Object.values(csv).reduce((s, r) => ({
  dist: s.dist + r.dist,
  fuel: s.fuel + r.fuel,
  idle: s.idle + r.idleMin,
}), { dist: 0, fuel: 0, idle: 0 });

console.log(
  h('TOTAL', W.v) +
  h(totDB.dist.toFixed(2), W.d) + h(totCSV.dist.toFixed(2), W.n) + h(pct(totDB.dist, totCSV.dist), W.fd) +
  h(totDB.fuel.toFixed(2), W.e) + h(totCSV.fuel.toFixed(2), W.fe) + h(pct(totDB.fuel, totCSV.fuel), W.fd) +
  h(totDB.idle.toFixed(2), W.im) + h(totCSV.idle.toFixed(2), W.fe) + h(pct(totDB.idle, totCSV.idle), W.fd)
);

console.log('\n' + (allOk ? '✅  All vehicles within ±5% tolerance.' : '⚠️   One or more vehicles exceed ±5% — review flagged rows above.'));
console.log('');

await appPrisma.$disconnect();
