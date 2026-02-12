/**
 * CHECK ATLAS TELEMATICS DATA
 * Verifies Samsara raw data is in the database for Atlas
 */

import { appPrisma } from '../lib/prisma.js';

async function main() {
  console.log('\n🔍 Checking Atlas Telematics Data (Samsara raw)...\n');

  const atlasOrgId = 'org_39RQY3qNO861ScQb0ZLFSUIFZkN';

  const records = await appPrisma.samsaraRawData.findMany({
    where: { clerkOrgId: atlasOrgId },
    orderBy: { date: 'desc' },
    take: 10,
  });

  console.log(`Found ${records.length} recent Samsara raw records\n`);

  if (records.length > 0) {
    console.log('Latest records:');
    records.forEach(r => {
      const converted = (r.rawResponse as any)?.convertedMetrics || {};
      console.log(`  ${r.date} - VIN: ${r.vin || 'N/A'} - ${r.vehicleName || 'N/A'}`);
      console.log(`    Miles: ${converted.milesDriven?.toFixed(1) ?? 'N/A'}, Fuel: ${converted.fuelGallons?.toFixed(1) ?? 'N/A'} gal`);
    });
    console.log('');
  }

  const totalCount = await appPrisma.samsaraRawData.count({
    where: { clerkOrgId: atlasOrgId },
  });

  console.log(`Total Atlas Samsara raw records: ${totalCount}\n`);

  const uniqueVins = await appPrisma.samsaraRawData.findMany({
    where: { clerkOrgId: atlasOrgId, vin: { not: null } },
    select: { vin: true },
    distinct: ['vin'],
  });

  console.log(`Unique VINs: ${uniqueVins.length}`);
  uniqueVins.forEach(v => console.log(`  - ${v.vin}`));
  console.log('');
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
