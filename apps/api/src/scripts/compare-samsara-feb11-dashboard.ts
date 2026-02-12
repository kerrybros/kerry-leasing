/**
 * Compare our stored Samsara data for 2026-02-11 to the dashboard table
 * from Samsara Fuel and Efficiency Report (user-provided).
 *
 * Run: pnpm tsx src/scripts/compare-samsara-feb11-dashboard.ts
 */

import 'dotenv/config';
import { appPrisma } from '../lib/prisma.js';

const DATE = '2026-02-11';
const DEFAULT_ORG = 'org_39RQY3qNO861ScQb0ZLFSUIFZkN'; // Atlas

// Dashboard table from Samsara UI (Fuel and Efficiency Report) - Feb 11
const DASHBOARD: Array<{
  vehicle: string;
  efficiency: number;
  fuelUsed: number;
  distance: number;
  totalEngineMin: number;
  idleTimeMin: number;
}> = [
  { vehicle: '205', efficiency: 8.42, fuelUsed: 19.15, distance: 161.32, totalEngineMin: 326.59, idleTimeMin: 47.04 },
  { vehicle: '78', efficiency: 7.86, fuelUsed: 6.47, distance: 50.85, totalEngineMin: 192.1, idleTimeMin: 56.62 },
  { vehicle: '54', efficiency: 5.84, fuelUsed: 9.77, distance: 57.1, totalEngineMin: 260.9, idleTimeMin: 114.38 },
  { vehicle: '48', efficiency: 0, fuelUsed: 3.04, distance: 0, totalEngineMin: 317.09, idleTimeMin: 317.09 },
  { vehicle: '354', efficiency: 7.97, fuelUsed: 14.89, distance: 118.73, totalEngineMin: 505.19, idleTimeMin: 267.33 },
  { vehicle: '387', efficiency: 11.85, fuelUsed: 6.12, distance: 72.58, totalEngineMin: 269.05, idleTimeMin: 156.17 },
  { vehicle: '824', efficiency: 7.79, fuelUsed: 13.21, distance: 102.82, totalEngineMin: 373.42, idleTimeMin: 132.29 },
  { vehicle: '31', efficiency: 6.89, fuelUsed: 11.36, distance: 78.28, totalEngineMin: 333.05, idleTimeMin: 167.48 },
  { vehicle: '140', efficiency: 7.66, fuelUsed: 12.81, distance: 98.07, totalEngineMin: 323.6, idleTimeMin: 155.62 },
  { vehicle: '825', efficiency: 7.17, fuelUsed: 11.09, distance: 79.59, totalEngineMin: 287.09, idleTimeMin: 47.59 },
];

function normName(name: string | null): string {
  if (!name) return '';
  return String(name).trim().replace(/^0+/, '') || name;
}

async function main() {
  const orgId = process.argv.find((a) => a.startsWith('--org='))?.split('=')[1] ?? DEFAULT_ORG;

  const records = await appPrisma.samsaraRawData.findMany({
    where: { clerkOrgId: orgId, date: DATE },
    select: {
      vehicleId: true,
      vehicleName: true,
      rawResponse: true,
    },
  });

  console.log(`Org: ${orgId}, Date: ${DATE}, Stored rows: ${records.length}`);
  if (records.length > 0) {
    console.log('Stored vehicle names:', records.map((r) => r.vehicleName).join(', '));
  }
  console.log('');

  const dashboardByVehicle = new Map(DASHBOARD.map((r) => [normName(r.vehicle), r]));
  // Key by both normalized and raw name so "048" and "48" both match
  const ourByVehicle = new Map<string, any>();
  for (const r of records) {
    const converted = (r.rawResponse as any)?.convertedMetrics || {};
    const entry = {
      vehicleName: r.vehicleName,
      vehicleId: r.vehicleId,
      fuelGallons: converted.fuelGallons ?? null,
      milesDriven: converted.milesDriven ?? null,
      engineHours: converted.engineHours ?? null,
      idleMinutes: converted.idleMinutes ?? null,
      avgMpg: converted.avgMpg ?? null,
    };
    const name = (r.vehicleName ?? '').trim();
    const norm = normName(name);
    ourByVehicle.set(norm, entry);
    if (norm !== name) ourByVehicle.set(name, entry);
  }

  // Allow small variance for API rounding (ml->gal, m->mi, ms->min) and dashboard display rounding
  const tol = { fuel: 0.15, distance: 0.5, engineMin: 5, idleMin: 2 };
  console.log('\n=== Stored vs Samsara Dashboard (Feb 11) ===\n');
  console.log(
    'Vehicle | Fuel (stored vs UI)     | Distance (stored vs UI)  | Engine min (stored vs UI) | Idle min (stored vs UI) | OK?'
  );
  console.log(
    '--------|------------------------|-------------------------|---------------------------|-------------------------|-----'
  );

  let allOk = true;
  const compared: string[] = [];

  for (const d of DASHBOARD) {
    const key = normName(d.vehicle);
    compared.push(key);
    const ours = ourByVehicle.get(key);
    if (!ours) {
      console.log(
        `  ${d.vehicle.padEnd(6)} | MISSING in our DB`
      );
      allOk = false;
      continue;
    }

    const engineMinStored = ours.engineHours != null ? ours.engineHours * 60 : null;
    const fuelOk =
      ours.fuelGallons != null && Math.abs(ours.fuelGallons - d.fuelUsed) <= tol.fuel;
    const distOk =
      ours.milesDriven != null && Math.abs(ours.milesDriven - d.distance) <= tol.distance;
    const engineOk =
      engineMinStored != null && Math.abs(engineMinStored - d.totalEngineMin) <= tol.engineMin;
    const idleOk =
      ours.idleMinutes != null && Math.abs(ours.idleMinutes - d.idleTimeMin) <= tol.idleMin;
    const ok = fuelOk && distOk && engineOk && idleOk;
    if (!ok) allOk = false;

    const fuelStr =
      ours.fuelGallons != null
        ? `${ours.fuelGallons.toFixed(2)} vs ${d.fuelUsed}`
        : 'null vs ' + d.fuelUsed;
    const distStr =
      ours.milesDriven != null
        ? `${ours.milesDriven.toFixed(2)} vs ${d.distance}`
        : 'null vs ' + d.distance;
    const engStr =
      engineMinStored != null
        ? `${engineMinStored.toFixed(1)} vs ${d.totalEngineMin}`
        : 'null vs ' + d.totalEngineMin;
    const idleStr =
      ours.idleMinutes != null
        ? `${ours.idleMinutes.toFixed(1)} vs ${d.idleTimeMin}`
        : 'null vs ' + d.idleTimeMin;

    console.log(
      `  ${d.vehicle.padEnd(6)} | ${fuelStr.padEnd(22)} | ${distStr.padEnd(23)} | ${engStr.padEnd(25)} | ${idleStr.padEnd(23)} | ${ok ? 'yes' : 'NO'}`
    );
  }

  console.log('\n' + (allOk ? 'All rows match within tolerance.' : 'Some rows differ beyond tolerance (see above).'));
  console.log('Tolerances: fuel ±0.15 gal, distance ±0.5 mi, engine ±5 min, idle ±2 min.');
  console.log('');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
