/**
 * MATCH ATLAS TELEMATICS TO SERVICE PLAN
 * Links telematicsVin to servicePlanUnit records by matching VINs
 */

import { appPrisma, repairPrisma } from '../lib/prisma.js';

async function main() {
  console.log('\n🔗 Matching Atlas Telematics VINs to Service Plan...\n');

  const atlasOrgId = 'org_39RQY3qNO861ScQb0ZLFSUIFZkN';

  // Get all Atlas service plan units
  const units = await appPrisma.servicePlanUnit.findMany({
    where: {
      clerkOrgId: atlasOrgId,
    },
  });

  console.log(`Found ${units.length} service plan units for Atlas\n`);

  let matched = 0;
  let notMatched = 0;

  for (const unit of units) {
    try {
      // Check if unit already has telematicsVin
      if (unit.telematicsVin) {
        console.log(`  ✓ ${unit.repairUnitNumber}: Already has telematics VIN (${unit.telematicsVin})`);
        matched++;
        continue;
      }

      // Try to find matching telematics data by repairVin (Samsara raw)
      if (unit.repairVin) {
        const telematicsRecord = await appPrisma.samsaraRawData.findFirst({
          where: {
            clerkOrgId: atlasOrgId,
            vin: unit.repairVin,
          },
        });

        if (telematicsRecord) {
          // Match found! Update the servicePlanUnit
          await appPrisma.servicePlanUnit.update({
            where: { id: unit.id },
            data: {
              telematicsVin: unit.repairVin,
              matchType: 'AUTO',
              lastSyncedAt: new Date(),
            },
          });

          console.log(`  ✅ ${unit.repairUnitNumber}: Matched VIN ${unit.repairVin}`);
          matched++;
        } else {
          console.log(`  ⚠️  ${unit.repairUnitNumber}: No telematics data for VIN ${unit.repairVin}`);
          notMatched++;
        }
      } else {
        console.log(`  ⚠️  ${unit.repairUnitNumber}: No repair VIN to match`);
        notMatched++;
      }
    } catch (error: any) {
      console.error(`  ❌ Error processing ${unit.repairUnitNumber}:`, error.message);
      notMatched++;
    }
  }

  console.log('\n✅ Matching complete!\n');
  console.log(`  Matched: ${matched}`);
  console.log(`  Not matched: ${notMatched}`);
  console.log(`  Total: ${units.length}`);
  console.log('');

  // Verify results
  const withTelem = await appPrisma.servicePlanUnit.count({
    where: {
      clerkOrgId: atlasOrgId,
      telematicsVin: { not: null },
    },
  });

  console.log(`Units with telematics VIN now: ${withTelem}\n`);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
