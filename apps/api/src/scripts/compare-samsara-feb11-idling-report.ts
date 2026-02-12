/**
 * Compare our stored Samsara idling events (aggregated) for 2026-02-11
 * to the Samsara "Idling Report per Vehicle" dashboard table (user-provided).
 *
 * Run: pnpm tsx src/scripts/compare-samsara-feb11-idling-report.ts
 */

import 'dotenv/config';
import { appPrisma } from '../lib/prisma.js';
import { getSamsaraIdleAggregatesByDate } from '../telematics/samsara/idleAggregates.js';

const DATE = '2026-02-11';
const DEFAULT_ORG = 'org_39RQY3qNO861ScQb0ZLFSUIFZkN'; // Atlas

// Idling Report per Vehicle (Samsara UI) - Feb 11 - Vehicle, Idle Time (HH:MM:SS), Fuel Used (gal)
const IDLING_REPORT: Array<{ vehicle: string; idleTimeHhMmSs: string; idleTimeMin: number; fuelUsedGal: number }> = [
  { vehicle: '354', idleTimeHhMmSs: '4:27:19', idleTimeMin: 4 * 60 + 27 + 19 / 60, fuelUsedGal: 3.02 },
  { vehicle: '140', idleTimeHhMmSs: '2:35:37', idleTimeMin: 2 * 60 + 35 + 37 / 60, fuelUsedGal: 2.14 },
  { vehicle: '31', idleTimeHhMmSs: '2:30:50', idleTimeMin: 2 * 60 + 30 + 50 / 60, fuelUsedGal: 2.05 },
  { vehicle: '387', idleTimeHhMmSs: '2:12:15', idleTimeMin: 2 * 60 + 12 + 15 / 60, fuelUsedGal: 0.9 },
  { vehicle: '824', idleTimeHhMmSs: '2:01:57', idleTimeMin: 2 * 60 + 1 + 57 / 60, fuelUsedGal: 1.66 },
  { vehicle: '54', idleTimeHhMmSs: '1:54:22', idleTimeMin: 1 * 60 + 54 + 22 / 60, fuelUsedGal: 1.61 },
  { vehicle: '78', idleTimeHhMmSs: '0:56:37', idleTimeMin: 56 + 37 / 60, fuelUsedGal: 0.88 },
  { vehicle: '825', idleTimeHhMmSs: '0:47:35', idleTimeMin: 47 + 35 / 60, fuelUsedGal: 0.65 },
  { vehicle: '205', idleTimeHhMmSs: '0:39:54', idleTimeMin: 39 + 54 / 60, fuelUsedGal: 0.76 },
];

function normName(name: string | null): string {
  if (!name) return '';
  return String(name).trim().replace(/^0+/, '') || name;
}

async function main() {
  const orgId = process.argv.find((a) => a.startsWith('--org='))?.split('=')[1] ?? DEFAULT_ORG;

  const [rawRecords, idleByDate] = await Promise.all([
    appPrisma.samsaraRawData.findMany({
      where: { clerkOrgId: orgId, date: DATE },
      select: { vehicleId: true, vehicleName: true },
    }),
    getSamsaraIdleAggregatesByDate(appPrisma, orgId, [DATE]),
  ]);

  const nameToVehicleId = new Map<string, string>();
  for (const r of rawRecords) {
    const name = (r.vehicleName ?? '').trim();
    const norm = normName(name);
    nameToVehicleId.set(norm, r.vehicleId);
    if (norm !== name) nameToVehicleId.set(name, r.vehicleId);
  }

  const aggregates = idleByDate.get(DATE);
  if (!aggregates) {
    console.log(`No idling aggregates for ${DATE}. Run sync for that date first.`);
    process.exit(1);
  }

  const tol = { idleMin: 2, fuelGal: 0.1 };
  console.log('\n=== Stored idling vs Samsara Idling Report (Feb 11) ===\n');
  console.log(
    'Vehicle | Idle time (stored vs report)        | Idle min (stored vs report)  | Fuel gal (stored vs report)   | OK?'
  );
  console.log(
    '--------|-------------------------------------|------------------------------|--------------------------------|-----'
  );

  let allOk = true;
  for (const row of IDLING_REPORT) {
    const vehicleId = nameToVehicleId.get(row.vehicle) ?? nameToVehicleId.get(normName(row.vehicle));
    const agg = vehicleId ? aggregates.get(vehicleId) : undefined;

    const storedIdleMin = agg ? agg.idleDurationMs / 60000 : null;
    const storedFuelGal = agg ? agg.idleFuelMl / 3785.41 : null;

    const idleOk =
      storedIdleMin != null && Math.abs(storedIdleMin - row.idleTimeMin) <= tol.idleMin;
    const fuelOk =
      storedFuelGal != null && Math.abs(storedFuelGal - row.fuelUsedGal) <= tol.fuelGal;
    const ok = idleOk && fuelOk;
    if (!ok) allOk = false;

    const idleStr =
      storedIdleMin != null
        ? `${(storedIdleMin / 60).toFixed(1)}h vs ${row.idleTimeHhMmSs}`
        : `MISSING vs ${row.idleTimeHhMmSs}`;
    const idleNumStr =
      storedIdleMin != null
        ? `${storedIdleMin.toFixed(1)} vs ${row.idleTimeMin.toFixed(1)}`
        : `— vs ${row.idleTimeMin.toFixed(1)}`;
    const fuelStr =
      storedFuelGal != null
        ? `${storedFuelGal.toFixed(2)} vs ${row.fuelUsedGal}`
        : `— vs ${row.fuelUsedGal}`;

    console.log(
      `  ${row.vehicle.padEnd(6)} | ${idleStr.padEnd(35)} | ${idleNumStr.padEnd(28)} | ${fuelStr.padEnd(30)} | ${ok ? 'yes' : 'NO'}`
    );
  }

  const inReportOnly = IDLING_REPORT.map((r) => r.vehicle);
  const inOurs = [...aggregates.keys()];
  const ourNames = rawRecords
    .filter((r) => aggregates.has(r.vehicleId))
    .map((r) => normName(r.vehicleName ?? '') || r.vehicleName);
  console.log('\nTolerances: idle ±2 min, fuel ±0.1 gal.');
  console.log(allOk ? 'All rows match within tolerance.' : 'Some rows differ beyond tolerance.');
  console.log('');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
