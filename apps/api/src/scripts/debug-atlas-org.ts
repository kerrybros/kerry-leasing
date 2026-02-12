/**
 * DEBUG ATLAS ORG
 */

import { appPrisma } from '../lib/prisma.js';

async function main() {
  console.log('\n🔍 Checking Atlas Organization Data\n');

  // Check all orgs with service plan units
  const orgsWithUnits = await appPrisma.servicePlanUnit.groupBy({
    by: ['clerkOrgId'],
    _count: true,
  });

  console.log('Organizations with Service Plan Units:');
  for (const org of orgsWithUnits) {
    const included = await appPrisma.servicePlanUnit.count({
      where: { clerkOrgId: org.clerkOrgId, isIncluded: true },
    });
    const withTelematics = await appPrisma.servicePlanUnit.count({
      where: { clerkOrgId: org.clerkOrgId, telematicsVin: { not: null } },
    });
    
    console.log(`\n  Org: ${org.clerkOrgId}`);
    console.log(`    Total Units: ${org._count}`);
    console.log(`    Included: ${included}`);
    console.log(`    With Telematics VIN: ${withTelematics}`);
  }

  // Check repair config
  console.log('\n\nRepair Customer Configs:');
  const configs = await appPrisma.repairCustomerConfig.findMany({
    select: {
      clerkOrgId: true,
      customerName: true,
      contractStartDate: true,
    },
  });

  for (const config of configs) {
    console.log(`  ${config.clerkOrgId}: ${config.customerName} (start: ${config.contractStartDate})`);
  }

  // Check org settings
  console.log('\n\nOrganization Settings:');
  const settings = await appPrisma.organizationSettings.findMany({
    select: {
      clerkOrgId: true,
      tracksDrivers: true,
    },
  });

  for (const setting of settings) {
    console.log(`  ${setting.clerkOrgId}: tracksDrivers = ${setting.tracksDrivers}`);
  }

  console.log('\n');
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
