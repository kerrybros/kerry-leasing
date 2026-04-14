/**
 * Fetch v2 vehicle_utilization for 2026-02-03 and compare to the CSV you shared.
 * Uses same params as your curl: start_at/end_at Eastern for that day.
 *
 * Usage: pnpm exec tsx src/scripts/fetch-v2-vehicle-utilization-feb3.ts
 */

import 'dotenv/config';
import { appPrisma } from '../lib/prisma.js';
import { MotiveClient } from '../telematics/motive/client.js';
import { readCredentials } from '../lib/credentials.js';

const ORG = 'org_39B7lu1b8YKds8IOtzrk6LpKnLW';
const DATE = '2026-02-03';
// Motive dashboard uses UTC day boundaries (midnight-to-midnight UTC).
// The original resolution confirmed: end_at = next day T00:00:00Z captures the full UTC day.
const START_AT = '2026-02-03T00:00:00Z';
const END_AT = '2026-02-04T00:00:00Z';

// Sample rows from your CSV (image) to compare
// Values from downloaded dashboard CSV (1775851350-vehicle_fuel_performance.csv)
const CSV_SAMPLE: Record<string, { idleMin: number; idleFuel: number; drivingMin: number; drivingFuel: number; distance: number; mpg: number | null }> = {
  '2204': { idleMin: 150.71, idleFuel: 1.21, drivingMin: 502.34, drivingFuel: 62.78, distance: 459.81, mpg: 7.32 },
  '2221': { idleMin: 228.71, idleFuel: 2.06, drivingMin: 368.06, drivingFuel: 41.66, distance: 313.79, mpg: 7.53 },
  '2176': { idleMin: 149.35, idleFuel: 1.54, drivingMin: 432.60, drivingFuel: 58.82, distance: 395.19, mpg: 6.72 },
};

interface V2Record {
  vehicle: { id: number; number?: string; vin?: string };
  utilization?: number;
  idle_time?: number;
  idle_fuel?: number;
  driving_time?: number;
  driving_fuel?: number;
  total_distance?: number;
}

async function main() {
  const account = await appPrisma.telematicsProviderAccount.findFirst({
    where: { clerkOrgId: ORG, provider: 'MOTIVE' },
  });
  if (!account) {
    console.error('No Motive account found for org', ORG);
    process.exit(1);
  }
  const creds = readCredentials(account.credentialsJson);
  const apiKey = creds.apiKey as string | undefined;
  if (!apiKey) {
    console.error('Motive account has no apiKey in credentialsJson');
    process.exit(1);
  }

  const client = new MotiveClient(apiKey);
  const results = await client.get<V2Record>('/v2/vehicle_utilization', {
    start_at: START_AT,
    end_at: END_AT,
  });

  const byVehicle: Record<string, V2Record> = {};
  for (const r of results) {
    const key = r.vehicle?.number ?? String(r.vehicle?.id ?? '');
    if (key) byVehicle[key] = r;
  }

  // Output CSV format (same columns as your export)
  console.log('\n--- v2 API pull for', DATE, '---\n');
  console.log('Vehicle,Utilization,Idling Time (mins),Idled Fuel (gal),Driving Time (mins),Driving Fuel (gal),Distance (mi),Fuel Efficiency (mpg)');
  for (const r of results) {
    const vehicle = r.vehicle?.number ?? String(r.vehicle?.id ?? '');
    const util = r.utilization != null ? r.utilization : '';
    const idleMin = r.idle_time != null ? (r.idle_time / 60).toFixed(2) : '';
    const idleFuel = r.idle_fuel != null ? r.idle_fuel.toFixed(2) : '';
    const drivingMin = r.driving_time != null ? (r.driving_time / 60).toFixed(2) : '';
    const drivingFuel = r.driving_fuel != null ? r.driving_fuel.toFixed(2) : '';
    const dist = r.total_distance != null ? r.total_distance.toFixed(2) : '';
    const mpg = r.driving_fuel != null && r.driving_fuel > 0 && r.total_distance != null
      ? (r.total_distance / r.driving_fuel).toFixed(2) : 'N/A';
    console.log([vehicle, util, idleMin, idleFuel, drivingMin, drivingFuel, dist, mpg].join(','));
  }

  const totalDrivingMin = results.reduce((s, r) => s + (r.driving_time != null ? r.driving_time / 60 : 0), 0);
  const totalIdleMin = results.reduce((s, r) => s + (r.idle_time != null ? r.idle_time / 60 : 0), 0);
  console.log('\nTotals:', results.length, 'vehicles | Sum Driving (min):', totalDrivingMin.toFixed(2), '| Sum Idling (min):', totalIdleMin.toFixed(2));

  // Compare to CSV sample
  console.log('\n--- Comparison to your CSV (sample rows) ---\n');
  const tol = 0.05; // 5% tolerance
  const pct = (a: number, b: number) => b === 0 ? '∞' : `${(((a - b) / b) * 100).toFixed(1)}%`;
  console.log('Vehicle | Drive Time (min) | Distance (mi) | Drive Fuel (gal) | Idle Time (min) | Idle Fuel (gal) | Moving MPG');
  console.log('        |  API   vs  CSV   |  API  vs  CSV |  API   vs  CSV   |  API  vs  CSV   |  API  vs  CSV   |  API  vs  CSV');
  for (const [veh, expected] of Object.entries(CSV_SAMPLE)) {
    const r = byVehicle[veh];
    if (!r) { console.log(`${veh}: NOT IN API RESPONSE`); continue; }
    const idleMin = (r.idle_time ?? 0) / 60;
    const drivingMin = (r.driving_time ?? 0) / 60;
    const movingMpg = (r.driving_fuel != null && r.driving_fuel > 0 && r.total_distance != null)
      ? r.total_distance / r.driving_fuel : null;
    console.log(
      `${veh} | ${drivingMin.toFixed(1)} vs ${expected.drivingMin} (${pct(drivingMin, expected.drivingMin)}) ` +
      `| ${(r.total_distance ?? 0).toFixed(2)} vs ${expected.distance} (${pct(r.total_distance ?? 0, expected.distance)}) ` +
      `| ${(r.driving_fuel ?? 0).toFixed(2)} vs ${expected.drivingFuel} (${pct(r.driving_fuel ?? 0, expected.drivingFuel)}) ` +
      `| ${idleMin.toFixed(1)} vs ${expected.idleMin} (${pct(idleMin, expected.idleMin)}) ` +
      `| ${(r.idle_fuel ?? 0).toFixed(2)} vs ${expected.idleFuel} (${pct(r.idle_fuel ?? 0, expected.idleFuel)}) ` +
      `| ${movingMpg?.toFixed(2) ?? 'N/A'} vs ${expected.mpg}`
    );
  }
  console.log('\nv2 API returned', results.length, 'vehicles.\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
