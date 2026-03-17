/**
 * Output our vehicle utilization for 2026-02-03 in the same format as the Motive UI report
 * so you can compare side-by-side. Columns: Vehicle, Utilization %, Idling Tim (min), Idled Fuel,
 * Driving Tir (min), Driving Fu, Distance, Fuel Efficiency (mpg).
 *
 * Usage: pnpm exec tsx src/scripts/compare-vehicle-utilization-feb3.ts
 */

import 'dotenv/config';
import { appPrisma } from '../lib/prisma.js';

const ORG = 'org_39B7lu1b8YKds8IOtzrk6LpKnLW';
const DATE = '2026-02-03';

async function main() {
  const rows = await appPrisma.motiveVehicleUtilization.findMany({
    where: { clerkOrgId: ORG, date: DATE },
    orderBy: [{ vehicleNumber: 'asc' }],
  });

  console.log('\n--- Our data (v1 API) for', DATE, '---\n');
  console.log(
    'Vehicle\tUtilization\tIdling Tim\tIdled Fuel\tDriving Tir\tDriving Fu\tDistance\tFuel Efficie'
  );

  for (const r of rows) {
    const vehicle = r.vehicleNumber ?? String(r.vehicleId);
    const util = r.utilizationPercentage != null ? r.utilizationPercentage.toFixed(0) : '';
    const idleMin =
      r.idleTime != null ? (r.idleTime / 60).toFixed(2) : '';
    const idleFuel = r.idleFuel != null ? r.idleFuel.toFixed(2) : '';
    const drivingMin =
      r.drivingTime != null ? (r.drivingTime / 60).toFixed(2) : '';
    const drivingFuel = r.drivingFuel != null ? r.drivingFuel.toFixed(2) : '';
    const dist = r.totalDistance != null ? r.totalDistance.toFixed(2) : '';
    const mpg =
      r.drivingFuel != null && r.drivingFuel > 0 && r.totalDistance != null
        ? (r.totalDistance / r.drivingFuel).toFixed(2)
        : 'N/A';

    console.log(
      `${vehicle}\t${util}\t${idleMin}\t${idleFuel}\t${drivingMin}\t${drivingFuel}\t${dist}\t${mpg}`
    );
  }

  const totalDrivingMin = rows.reduce(
    (s, r) => s + (r.drivingTime != null ? r.drivingTime / 60 : 0),
    0
  );
  const totalIdleMin = rows.reduce(
    (s, r) => s + (r.idleTime != null ? r.idleTime / 60 : 0),
    0
  );
  console.log('\nTotals:', rows.length, 'vehicles');
  console.log('  Sum Driving Tir (min):', totalDrivingMin.toFixed(2));
  console.log('  Sum Idling Tim (min):', totalIdleMin.toFixed(2));
  console.log('');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
