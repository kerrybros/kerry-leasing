/**
 * MOTIVE FULL SPOT-CHECK — February 3, 2026
 *
 * Validates four Motive API endpoints against dashboard CSVs:
 *   1. /v2/driver_utilization   → driver_fuel_performance.csv
 *   2. /v1/driving_periods      → activity_details.csv (vehicles 2204 & 2176)
 *   3. /v2/vehicle_utilization  → vehicles 2241 & 2243 gap investigation
 *      (UTC vs EST boundaries to find the correct day window)
 *
 * Usage: pnpm exec tsx src/scripts/phase0/spot-check-motive-feb3-full.ts
 */

import 'dotenv/config';
import { appPrisma } from '../../lib/prisma.js';
import { MotiveClient } from '../../telematics/motive/client.js';
import { readCredentials } from '../../lib/credentials.js';

const ORG = 'org_39B7lu1b8YKds8IOtzrk6LpKnLW'; // Wolverine

// Dashboard CSV ground-truth (from driver_fuel_performance.csv)
const DRIVER_CSV: Record<string, { vehicle: string; distMi: number; driveMin: number; idleMin: number; driveFuel: number; idleFuel: number; movingMpg: number }> = {
  'Troy Thomas':        { vehicle: '2234', distMi: 363.50, driveMin: 424.53, idleMin: 166.74, driveFuel: 43.90,  idleFuel: 1.77, movingMpg: 8.28 },
  'Joe Parker':         { vehicle: '2204', distMi: 459.81, driveMin: 502.34, idleMin: 133.36, driveFuel: 62.78,  idleFuel: 1.02, movingMpg: 7.32 },
  'Eric Curley':        { vehicle: '2221', distMi: 313.79, driveMin: 368.06, idleMin: 228.71, driveFuel: 41.66,  idleFuel: 2.06, movingMpg: 7.53 },
  'Walter Brown':       { vehicle: '2222', distMi: 456.71, driveMin: 550.45, idleMin: 149.08, driveFuel: 65.28,  idleFuel: 1.36, movingMpg: 7.00 },
  'Greg Gretch':        { vehicle: '2233', distMi: 293.91, driveMin: 327.46, idleMin: 175.52, driveFuel: 41.70,  idleFuel: 1.94, movingMpg: 7.05 },
  'Charles Williams':   { vehicle: '2226', distMi: 318.14, driveMin: 394.57, idleMin: 221.08, driveFuel: 45.41,  idleFuel: 1.84, movingMpg: 7.01 },
  'Steve Stankovski':   { vehicle: '2202', distMi: 392.09, driveMin: 407.07, idleMin: 187.64, driveFuel: 56.97,  idleFuel: 1.37, movingMpg: 6.88 },
  'James Scott':        { vehicle: '2183', distMi:  91.34, driveMin: 168.63, idleMin:  79.60, driveFuel: 12.91,  idleFuel: 0.79, movingMpg: 7.08 },
  'Steve Moore':        { vehicle: '2225', distMi: 369.09, driveMin: 488.32, idleMin: 246.55, driveFuel: 53.19,  idleFuel: 2.47, movingMpg: 6.94 },
  'AJ Rozycki':         { vehicle: '2232', distMi: 360.40, driveMin: 368.48, idleMin: 251.59, driveFuel: 52.49,  idleFuel: 2.41, movingMpg: 6.87 },
  'Tony Jones':         { vehicle: '2224', distMi: 373.44, driveMin: 421.61, idleMin:  98.12, driveFuel: 56.00,  idleFuel: 1.01, movingMpg: 6.67 },
  'George Gingras':     { vehicle: '2223', distMi: 567.31, driveMin: 574.54, idleMin: 167.65, driveFuel: 86.15,  idleFuel: 1.54, movingMpg: 6.58 },
  'Darrick Bellman':    { vehicle: '2231', distMi: 351.70, driveMin: 369.51, idleMin: 142.34, driveFuel: 52.74,  idleFuel: 2.11, movingMpg: 6.67 },
  'Calvin Solomon':     { vehicle: '2176', distMi: 298.88, driveMin: 336.57, idleMin: 129.04, driveFuel: 45.34,  idleFuel: 1.34, movingMpg: 6.59 },
  'Chris Cotton':       { vehicle: '2242', distMi: 101.28, driveMin: 163.82, idleMin: 239.05, driveFuel: 14.53,  idleFuel: 2.32, movingMpg: 6.97 },
  'Sam Bisesi':         { vehicle: '2251', distMi: 216.86, driveMin: 273.98, idleMin: 148.93, driveFuel: 34.52,  idleFuel: 1.80, movingMpg: 6.28 },
  'Jamie Shell':        { vehicle: '2241', distMi: 270.92, driveMin: 231.86, idleMin:  46.99, driveFuel: 45.15,  idleFuel: 0.43, movingMpg: 6.00 },
  'Rob Zimmerman':      { vehicle: '2243', distMi: 525.06, driveMin: 471.58, idleMin: 232.36, driveFuel: 88.66,  idleFuel: 2.01, movingMpg: 5.92 },
};

// Activity details ground-truth (from activity_details CSVs)
// Vehicle 2204 (Joe Parker) — distances in miles
const ACTIVITY_2204 = [
  { dist: 0.0,   idleSec: 1190, label: 'Distribution Plant (pre-trip)' },
  { dist: 92.6,  idleSec: 726,  label: 'Loves - Loveport' },
  { dist: 16.1,  idleSec: 2498, label: "Jack's Shields" },
  { dist: 3.7,   idleSec: 0,    label: 'Green Acres Plz' },
  { dist: 18.9,  idleSec: 1423, label: "Jack's Midland" },
  { dist: 42.4,  idleSec: 1285, label: "Jay's Fruit Market" },
  { dist: 89.1,  idleSec: 1632, label: 'Reed City' },
  { dist: 39.9,  idleSec: 0,    label: 'Clare Welcome Center' },
  { dist: 157.0, idleSec: 289,  label: 'Distribution Plant (return)' },
];

// Vehicle 2176 — combined Calvin + Unidentified
const ACTIVITY_2176 = [
  { dist: 0.0,  idleSec: 1697, driver: 'Calvin',      label: 'Distribution Plant (pre-trip)' },
  { dist: 0.0,  idleSec: 378,  driver: 'Calvin',      label: 'Distribution Plant (move)' },
  { dist: 43.0, idleSec: 236,  driver: 'Calvin',      label: 'Monroe' },
  { dist: 123.6,idleSec: 1164, driver: 'Calvin',      label: "Dave's #5 (1st)" },
  { dist: 0.0,  idleSec: 460,  driver: 'Calvin',      label: "Dave's #5 (2nd)" },
  { dist: 25.1, idleSec: 805,  driver: 'Calvin',      label: 'Macedonia' },
  { dist: 0.1,  idleSec: 453,  driver: 'Calvin',      label: 'Northern Haserot' },
  { dist: 11.2, idleSec: 1382, driver: 'Calvin',      label: 'US Foods (1st)' },
  { dist: 0.2,  idleSec: 1167, driver: 'Calvin',      label: 'US Foods (2nd)' },
  { dist: 95.4, idleSec: 345,  driver: 'Calvin',      label: 'Vickers Rest Area' },
  { dist: 95.7, idleSec: 640,  driver: 'Unidentified', label: 'Detroit (return 1)' },
  { dist: 0.4,  idleSec: 234,  driver: 'Unidentified', label: 'Detroit (return 2)' },
  { dist: 0.1,  idleSec: 0,    driver: 'Unidentified', label: 'Kerry Brothers' },
];

function pct(api: number, csv: number): string {
  if (csv === 0) return api === 0 ? '0.0%' : '∞';
  return `${(((api - csv) / csv) * 100).toFixed(1)}%`;
}

function check(api: number, csv: number, tol = 0.05): string {
  if (csv === 0 && api === 0) return '✓';
  if (csv === 0) return `DIFF (api=${api.toFixed(2)})`;
  const diff = Math.abs(api - csv) / csv;
  return diff <= tol ? `✓ (${pct(api, csv)})` : `⚠ (${pct(api, csv)})`;
}

async function main() {
  const account = await appPrisma.telematicsProviderAccount.findFirst({
    where: { clerkOrgId: ORG, provider: 'MOTIVE' },
  });
  if (!account) { console.error('No Motive account found'); process.exit(1); }

  const creds = readCredentials(account.credentialsJson);
  const apiKey = creds.apiKey as string;
  if (!apiKey) { console.error('No apiKey in credentials'); process.exit(1); }

  const client = new MotiveClient(apiKey);

  // ============================================================
  // 1. DRIVER UTILIZATION — /v2/driver_utilization
  // ============================================================
  console.log('\n' + '='.repeat(80));
  console.log('1. DRIVER UTILIZATION — /v2/driver_utilization (start_date/end_date = 2026-02-03)');
  console.log('='.repeat(80));

  const driverRecords = await client.get<any>('/v2/driver_utilization', {
    start_date: '2026-02-03',
    end_date: '2026-02-03',
  });

  console.log(`\nAPI returned ${driverRecords.length} driver records\n`);

  // Build lookup by driver name
  const byDriverName: Record<string, any> = {};
  for (const r of driverRecords) {
    const d = r.driver ?? r;
    const name = [d.first_name, d.last_name].filter(Boolean).join(' ').trim();
    if (name) byDriverName[name] = r;
  }

  // Show raw fields from first record so we know what the API actually returns
  if (driverRecords.length > 0) {
    console.log('Raw fields available from API (first record):');
    console.log(JSON.stringify(driverRecords[0], null, 2));
    console.log('');
  }

  console.log('Driver                | Drive Time (min)       | Idle Time (min)        | Drive Fuel (gal)       | Idle Fuel (gal)');
  console.log('                      | API    CSV    Check    | API    CSV    Check    | API    CSV    Check    | API   CSV   Check');
  console.log('-'.repeat(120));

  for (const [driverName, csv] of Object.entries(DRIVER_CSV)) {
    const r = byDriverName[driverName];
    if (!r) {
      console.log(`${driverName.padEnd(22)}| NOT IN API RESPONSE`);
      continue;
    }
    const driveMin = (r.driving_time ?? 0) / 60;
    const idleMin  = (r.idle_time  ?? 0) / 60;
    const driveFuel = r.driving_fuel ?? 0;
    const idleFuel  = r.idle_fuel   ?? 0;

    console.log(
      `${driverName.padEnd(22)}` +
      `| ${driveMin.toFixed(1).padStart(6)} ${csv.driveMin.toFixed(1).padStart(6)}  ${check(driveMin, csv.driveMin).padEnd(8)}` +
      `| ${idleMin.toFixed(1).padStart(6)} ${csv.idleMin.toFixed(1).padStart(6)}  ${check(idleMin, csv.idleMin).padEnd(8)}` +
      `| ${driveFuel.toFixed(2).padStart(6)} ${csv.driveFuel.toFixed(2).padStart(6)}  ${check(driveFuel, csv.driveFuel).padEnd(8)}` +
      `| ${idleFuel.toFixed(2).padStart(5)} ${csv.idleFuel.toFixed(2).padStart(5)}  ${check(idleFuel, csv.idleFuel)}`
    );
  }

  // ============================================================
  // 2. DRIVING PERIODS — /v1/driving_periods
  //    Validate vehicles 2204 and 2176 against activity details CSVs
  // ============================================================
  console.log('\n' + '='.repeat(80));
  console.log('2. DRIVING PERIODS — /v1/driving_periods (start_date/end_date = 2026-02-03)');
  console.log('='.repeat(80));

  const drivingPeriods = await client.get<any>('/v1/driving_periods', {
    start_date: '2026-02-03',
    end_date: '2026-02-03',
  });

  console.log(`\nAPI returned ${drivingPeriods.length} driving period records\n`);

  // Show raw fields from first record
  if (drivingPeriods.length > 0) {
    console.log('Raw fields from first driving period:');
    console.log(JSON.stringify(drivingPeriods[0], null, 2));
    console.log('');
  }

  // Filter to 2204 and 2176 by vehicle number
  const periods2204 = drivingPeriods.filter((r: any) => String(r.vehicle?.number) === '2204');
  const periods2176 = drivingPeriods.filter((r: any) => String(r.vehicle?.number) === '2176');

  // Sum distances from activity CSV for comparison
  const csvDist2204 = ACTIVITY_2204.reduce((s, r) => s + r.dist, 0);
  const csvIdle2204 = ACTIVITY_2204.reduce((s, r) => s + r.idleSec, 0) / 60;
  const csvDist2176 = ACTIVITY_2176.reduce((s, r) => s + r.dist, 0);
  const csvIdle2176 = ACTIVITY_2176.reduce((s, r) => s + r.idleSec, 0) / 60;
  const csvDistCalvin = ACTIVITY_2176.filter(r => r.driver === 'Calvin').reduce((s, r) => s + r.dist, 0);

  // Sum driving periods — distance field is a string in the type definition
  const apiDist2204 = periods2204.reduce((s: number, r: any) => s + (parseFloat(r.distance ?? '0') || 0), 0);
  const apiDist2176 = periods2176.reduce((s: number, r: any) => s + (parseFloat(r.distance ?? '0') || 0), 0);
  const duration2204 = periods2204.reduce((s: number, r: any) => s + (r.duration ?? 0), 0) / 60;
  const duration2176 = periods2176.reduce((s: number, r: any) => s + (r.duration ?? 0), 0) / 60;

  // Split 2176 by driver
  const periods2176Calvin = periods2176.filter((r: any) => {
    const name = [(r.driver?.first_name ?? ''), (r.driver?.last_name ?? '')].join(' ').trim();
    return name.toLowerCase().includes('calvin') || name.toLowerCase().includes('solomon');
  });
  const apiDistCalvin = periods2176Calvin.reduce((s: number, r: any) => s + (parseFloat(r.distance ?? '0') || 0), 0);

  console.log(`\nVehicle 2204 — ${periods2204.length} driving periods`);
  console.log(`  Distance: API ${apiDist2204.toFixed(2)} mi  vs  Activity CSV ${csvDist2204.toFixed(2)} mi  vs  Vehicle CSV 459.81 mi  ${check(apiDist2204, 459.81)}`);
  console.log(`  Duration: API ${duration2204.toFixed(1)} min  vs  Driver CSV 502.34 min`);

  console.log(`\nVehicle 2176 — ${periods2176.length} driving periods`);
  console.log(`  Total distance: API ${apiDist2176.toFixed(2)} mi  vs  Vehicle CSV 395.19 mi  ${check(apiDist2176, 395.19)}`);
  console.log(`  Calvin distance: API ${apiDistCalvin.toFixed(2)} mi  vs  Activity CSV ${csvDistCalvin.toFixed(2)} mi  vs  Driver CSV 298.88 mi`);
  console.log(`  Total duration: API ${duration2176.toFixed(1)} min  vs  Vehicle CSV 432.60 min`);

  // List periods for 2204
  console.log('\n  Driving periods for 2204:');
  for (const p of periods2204) {
    const driverName = [(p.driver?.first_name ?? ''), (p.driver?.last_name ?? '')].join(' ').trim() || 'Unidentified';
    const distMi = parseFloat(p.distance ?? '0') || 0;
    console.log(`    ${p.start_time?.substring(0,16)} → ${p.end_time?.substring(0,16)}  ${distMi.toFixed(2)} mi  ${driverName}  origin: ${p.origin ?? ''}`);
  }

  console.log('\n  Driving periods for 2176:');
  for (const p of periods2176) {
    const driverName = [(p.driver?.first_name ?? ''), (p.driver?.last_name ?? '')].join(' ').trim() || 'Unidentified';
    const distMi = parseFloat(p.distance ?? '0') || 0;
    console.log(`    ${p.start_time?.substring(0,16)} → ${p.end_time?.substring(0,16)}  ${distMi.toFixed(2)} mi  ${driverName}  dest: ${p.destination ?? ''}`);
  }

  // ============================================================
  // 3. VEHICLE 2241 & 2243 GAP INVESTIGATION
  //    Try both UTC midnight and EST midnight boundaries
  // ============================================================
  console.log('\n' + '='.repeat(80));
  console.log('3. VEHICLE GAP INVESTIGATION — 2241 & 2243');
  console.log('   Dashboard CSV: 2241 = 270.92 mi, 2243 = 525.06 mi');
  console.log('='.repeat(80));

  // UTC midnight (what we currently use for v2/vehicle_utilization)
  const utcStart = '2026-02-03T00:00:00Z';
  const utcEnd   = '2026-02-04T00:00:00Z';
  // EST midnight (midnight Eastern = 05:00 UTC in winter)
  const estStart = '2026-02-03T05:00:00Z';
  const estEnd   = '2026-02-04T05:00:00Z';

  for (const [label, startAt, endAt] of [
    ['UTC midnight-to-midnight (current)', utcStart, utcEnd],
    ['EST midnight-to-midnight', estStart, estEnd],
  ] as [string, string, string][]) {
    console.log(`\n  Boundary: ${label} (${startAt} → ${endAt})`);

    const records = await client.get<any>('/v2/vehicle_utilization', {
      start_at: startAt,
      end_at: endAt,
    });

    const r2241 = records.find((r: any) => String(r.vehicle?.number) === '2241');
    const r2243 = records.find((r: any) => String(r.vehicle?.number) === '2243');

    for (const [veh, r, csvDist, csvDriveMin, csvIdleMin] of [
      ['2241', r2241, 270.92, 231.86, 68.87],
      ['2243', r2243, 525.06, 471.58, 232.36],
    ] as [string, any, number, number, number][]) {
      if (!r) { console.log(`    ${veh}: NOT IN RESPONSE`); continue; }
      const distMi   = r.total_distance ?? 0;
      const driveMin = (r.driving_time ?? 0) / 60;
      const idleMin  = (r.idle_time ?? 0) / 60;
      console.log(
        `    ${veh}: dist ${distMi.toFixed(2)} mi ${check(distMi, csvDist)} | ` +
        `drive ${driveMin.toFixed(1)} min ${check(driveMin, csvDriveMin)} | ` +
        `idle ${idleMin.toFixed(1)} min ${check(idleMin, csvIdleMin)}`
      );
    }
  }

  // Also try: what do driving periods say for 2241 and 2243?
  console.log('\n  Driving periods check for 2241 and 2243:');
  const periods2241 = drivingPeriods.filter((r: any) => String(r.vehicle?.number) === '2241');
  const periods2243 = drivingPeriods.filter((r: any) => String(r.vehicle?.number) === '2243');
  const dist2241dp = periods2241.reduce((s: number, r: any) => s + (parseFloat(r.distance ?? '0') || 0), 0);
  const dist2243dp = periods2243.reduce((s: number, r: any) => s + (parseFloat(r.distance ?? '0') || 0), 0);
  console.log(`    2241: ${periods2241.length} periods, sum distance = ${dist2241dp.toFixed(2)} mi (CSV: 270.92 mi)`);
  console.log(`    2243: ${periods2243.length} periods, sum distance = ${dist2243dp.toFixed(2)} mi (CSV: 525.06 mi)`);

  await appPrisma.$disconnect();
  console.log('\n' + '='.repeat(80));
  console.log('DONE');
  console.log('='.repeat(80));
}

main().catch((e) => { console.error(e); process.exit(1); });
