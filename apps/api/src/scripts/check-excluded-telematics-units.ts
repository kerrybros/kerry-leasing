/**
 * Check for Motive units excluded from telematics because they're not in the service plan
 *
 * All units in the service plan are shown in fleet/reports. This script finds VINs
 * that have Motive data but no service plan row (telematicsVin) — those never appear.
 *
 * Usage:
 *   pnpm tsx src/scripts/check-excluded-telematics-units.ts --org=org_39B7lu1b8YKds8IOtzrk6LpKnLW
 */

import 'dotenv/config';
import { getAppPrisma } from '../lib/prisma.js';

function parseArgs(): { org: string } {
  const args = process.argv.slice(2);
  for (const arg of args) {
    if (arg.startsWith('--org=')) {
      return { org: arg.split('=')[1] };
    }
  }
  throw new Error('Required: --org=org_xxxxx');
}

async function main() {
  const { org } = parseArgs();
  const app = getAppPrisma();

  const motiveRecords = await app.motiveVehicleUtilization.findMany({
    where: { clerkOrgId: org },
    select: { vin: true, vehicleNumber: true },
    distinct: ['vin'],
  });
  const motiveVins = new Set(motiveRecords.map((r) => r.vin).filter((v): v is string => !!v));
  const motiveByVin = new Map(motiveRecords.filter((r) => r.vin).map((r) => [r.vin!, r]));

  const planUnits = await app.servicePlanUnit.findMany({
    where: { clerkOrgId: org },
    select: { telematicsVin: true, repairUnitNumber: true },
  });
  const planTelematicsVins = new Set(
    planUnits.filter((u) => u.telematicsVin).map((u) => u.telematicsVin!)
  );

  const notInPlan = [...motiveVins].filter((v) => !planTelematicsVins.has(v));

  console.log('\n--- Telematics vs service plan ---');
  console.log(`Org: ${org}\n`);
  console.log(`Motive vehicle utilization: ${motiveVins.size} distinct VINs`);
  console.log(`Service plan units with telematicsVin: ${planTelematicsVins.size}`);
  console.log(`(All service plan units are shown in fleet/reports.)\n`);

  if (notInPlan.length === 0) {
    console.log('Every VIN with Motive data has a service plan row → none excluded.\n');
    return;
  }

  console.log(`VINs with Motive data but not in service plan (${notInPlan.length}):`);
  console.log('(Add or match these in the service plan to show them in fleet.)\n');
  for (const vin of notInPlan) {
    const info = motiveByVin.get(vin);
    console.log(`  ${vin}  (${info?.vehicleNumber ?? '—'})`);
  }
  console.log('');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
