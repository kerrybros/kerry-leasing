/**
 * CHECK SAMSARA RAW DATA
 * Investigates the raw Samsara data to see what we have
 */

import { appPrisma } from '../lib/prisma.js';

async function main() {
  console.log('\n🔍 Analyzing Samsara Raw Data...\n');

  const atlasOrgId = 'org_39RQY3qNO861ScQb0ZLFSUIFZkN';

  // Total records
  const total = await appPrisma.samsaraRawData.count({
    where: { clerkOrgId: atlasOrgId },
  });

  // Records with VINs
  const withVins = await appPrisma.samsaraRawData.count({
    where: {
      clerkOrgId: atlasOrgId,
      vin: { not: null },
    },
  });

  // Records without VINs
  const withoutVins = total - withVins;

  console.log(`Total Raw Records: ${total}`);
  console.log(`  With VINs: ${withVins}`);
  console.log(`  Without VINs: ${withoutVins}`);
  console.log('');

  // Get date range
  const records = await appPrisma.samsaraRawData.findMany({
    where: { clerkOrgId: atlasOrgId },
    select: { date: true, vin: true, vehicleName: true },
    orderBy: { date: 'asc' },
  });

  if (records.length > 0) {
    const dates = records.map(r => r.date).filter((v, i, a) => a.indexOf(v) === i).sort();
    console.log(`Date Range: ${dates[0]} to ${dates[dates.length - 1]}`);
    console.log(`Unique Dates: ${dates.length}`);
    console.log('');

    // Show sample of records without VINs
    const noVins = records.filter(r => !r.vin).slice(0, 5);
    if (noVins.length > 0) {
      console.log('Sample records WITHOUT VINs:');
      noVins.forEach(r => {
        console.log(`  ${r.date}: ${r.vehicleName || 'Unknown'}`);
      });
      console.log('');
    }

    // Show sample of records with VINs
    const hasVins = records.filter(r => r.vin).slice(0, 5);
    if (hasVins.length > 0) {
      console.log('Sample records WITH VINs:');
      hasVins.forEach(r => {
        console.log(`  ${r.date}: ${r.vehicleName || 'Unknown'} (${r.vin})`);
      });
      console.log('');
    }
  }

}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
