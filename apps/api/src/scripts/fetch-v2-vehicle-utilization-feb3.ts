/**
 * Fetch v2 vehicle_utilization for 2026-02-03 and compare to the CSV you shared.
 * Uses same params as your curl: start_at/end_at Eastern for that day.
 *
 * Usage: pnpm exec tsx src/scripts/fetch-v2-vehicle-utilization-feb3.ts
 */

import 'dotenv/config';
import { appPrisma } from '../lib/prisma.js';
import { MotiveClient } from '../telematics/motive/client.js';

const ORG = 'org_39B7lu1b8YKds8IOtzrk6LpKnLW';
const DATE = '2026-02-03';
const START_AT = '2026-02-03T00:00:00-05:00';
const END_AT = '2026-02-03T23:59:59-05:00';

// Sample rows from your CSV (image) to compare
const CSV_SAMPLE: Record<string, { util: number; idleMin: number; idleFuel: number; drivingMin: number; drivingFuel: number; distance: number; mpg: number | null }> = {
  '111': { util: 16, idleMin: 431.6, idleFuel: 5.15, drivingMin: 79.38, drivingFuel: 2.25, distance: 32.31, mpg: 4.37 },
  '2176': { util: 74, idleMin: 149.35, idleFuel: 1.54, drivingMin: 415.42, drivingFuel: 58.03, distance: 395.19, mpg: 6.63 },
  '2203': { util: 0, idleMin: 16.35, idleFuel: 0.28, drivingMin: 0, drivingFuel: 0, distance: 0, mpg: null },
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
    where: { clerkOrgId: ORG, provider: 'MOTIVE', status: 'ACTIVE' },
  });
  if (!account) {
    console.error('No active Motive account for org', ORG);
    process.exit(1);
  }
  const apiKey = (account.credentialsJson as { apiKey?: string })?.apiKey;
  if (!apiKey) {
    console.error('No API key for org', ORG);
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
  const tol = 0.02;
  const eq = (a: number, b: number) => Math.abs(a - b) <= tol;
  for (const [veh, expected] of Object.entries(CSV_SAMPLE)) {
    const r = byVehicle[veh];
    if (!r) {
      console.log('Vehicle', veh, ': NOT IN API RESPONSE');
      continue;
    }
    const idleMin = (r.idle_time ?? 0) / 60;
    const drivingMin = (r.driving_time ?? 0) / 60;
    const mpg = (r.driving_fuel != null && r.driving_fuel > 0 && r.total_distance != null)
      ? r.total_distance / r.driving_fuel : null;
    const okUtil = r.utilization != null && eq(r.utilization, expected.util);
    const okIdleMin = eq(idleMin, expected.idleMin);
    const okIdleFuel = r.idle_fuel != null && eq(r.idle_fuel, expected.idleFuel);
    const okDrivingMin = eq(drivingMin, expected.drivingMin);
    const okDrivingFuel = r.driving_fuel != null && eq(r.driving_fuel, expected.drivingFuel);
    const okDist = (r.total_distance != null && expected.distance === 0) ? r.total_distance === 0 : (r.total_distance != null && eq(r.total_distance, expected.distance));
    const okMpg = expected.mpg === null ? mpg === null : (mpg != null && eq(mpg, expected.mpg));
    const all = okUtil && okIdleMin && okIdleFuel && okDrivingMin && okDrivingFuel && okDist && okMpg;
    console.log('Vehicle', veh, all ? 'MATCHES' : 'DIFF', {
      utilization: okUtil ? 'ok' : `api=${r.utilization} csv=${expected.util}`,
      idlingMin: okIdleMin ? 'ok' : `api=${idleMin.toFixed(2)} csv=${expected.idleMin}`,
      idledFuel: okIdleFuel ? 'ok' : `api=${r.idle_fuel} csv=${expected.idleFuel}`,
      drivingMin: okDrivingMin ? 'ok' : `api=${drivingMin.toFixed(2)} csv=${expected.drivingMin}`,
      drivingFuel: okDrivingFuel ? 'ok' : `api=${r.driving_fuel} csv=${expected.drivingFuel}`,
      distance: okDist ? 'ok' : `api=${r.total_distance} csv=${expected.distance}`,
      mpg: okMpg ? 'ok' : `api=${mpg?.toFixed(2)} csv=${expected.mpg}`,
    });
  }
  console.log('\nYour CSV had ~39 rows; v2 API returned', results.length, 'vehicles.\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
