/**
 * CHECK ATLAS SERVICE PLAN UNITS
 * Verifies if Atlas vehicles are properly configured in servicePlanUnit table
 */

import { appPrisma } from '../lib/prisma.js';

async function main() {
  console.log('\n🔍 Checking Atlas Service Plan Units...\n');

  const atlasOrgId = 'org_39RQY3qNO861ScQb0ZLFSUIFZkN';

  // Get all service plan units for Atlas
  const units = await appPrisma.servicePlanUnit.findMany({
    where: {
      clerkOrgId: atlasOrgId,
    },
    orderBy: { repairUnitNumber: 'asc' },
  });

  console.log(`Total Service Plan Units: ${units.length}`);
  console.log(`  Included: ${units.filter(u => u.isIncluded).length}`);
  console.log(`  Excluded: ${units.filter(u => !u.isIncluded).length}`);
  console.log('');

  // Check for telematics VINs
  const withTelematics = units.filter(u => u.telematicsVin);
  console.log(`Units with Telematics VIN: ${withTelematics.length}`);
  console.log('');

  if (withTelematics.length === 0) {
    console.log('❌ NO UNITS HAVE TELEMATICS VINs!');
    console.log('');
    console.log('This is why you don\'t see data in the UI.');
    console.log('The servicePlanUnit table needs to have telematicsVin populated.');
    console.log('');
  } else {
    console.log('Sample units with telematics:');
    withTelematics.slice(0, 5).forEach(u => {
      console.log(`  ${u.repairUnitNumber}: ${u.telematicsVin} (included: ${u.isIncluded})`);
    });
    console.log('');
  }

  // Get VINs from Samsara raw data
  const telematicsVins = await appPrisma.samsaraRawData.findMany({
    where: {
      clerkOrgId: atlasOrgId,
      vin: { not: null },
    },
    select: { vin: true },
    distinct: ['vin'],
  });

  console.log(`VINs in Samsara raw data: ${telematicsVins.length}`);
  telematicsVins.forEach(v => console.log(`  - ${v.vin}`));
  console.log('');

  // Check for mismatches
  const telematicsVinSet = new Set(telematicsVins.map(v => v.vin));
  const servicePlanVinSet = new Set(units.map(u => u.telematicsVin).filter(v => v));

  const inTelematicsNotInServicePlan = telematicsVins.filter(v => !servicePlanVinSet.has(v.vin));
  const inServicePlanNotInTelematics = units.filter(u => u.telematicsVin && !telematicsVinSet.has(u.telematicsVin));

  if (inTelematicsNotInServicePlan.length > 0) {
    console.log(`⚠️  VINs in telematics but NOT in servicePlanUnit: ${inTelematicsNotInServicePlan.length}`);
    inTelematicsNotInServicePlan.forEach(v => console.log(`  - ${v.vin}`));
    console.log('');
  }

  if (inServicePlanNotInTelematics.length > 0) {
    console.log(`⚠️  VINs in servicePlanUnit but NOT in telematics: ${inServicePlanNotInTelematics.length}`);
    inServicePlanNotInTelematics.forEach(u => console.log(`  - ${u.telematicsVin} (${u.repairUnitNumber})`));
    console.log('');
  }

  console.log('🔧 SOLUTION:');
  console.log('');
  console.log('The servicePlanUnit records need to have telematicsVin populated.');
  console.log('Run the matching script to link repair units with telematics VINs.');
  console.log('');
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
