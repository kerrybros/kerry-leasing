/**
 * Update Clerk Org ID for Telematics Data
 * 
 * Run this script after creating the production Wolverine organization in Clerk
 * to update all existing telematics data to use the correct org ID.
 * 
 * Usage:
 *   pnpm tsx src/scripts/update-org-id.mjs <oldOrgId> <newOrgId>
 * 
 * Example:
 *   pnpm tsx src/scripts/update-org-id.mjs org_2slAi3SqvSCzvqCJE3i2YtWQCsO org_2XXXXXXXXXXXX
 */

import 'dotenv/config';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('../generated/app-client/index.js');

const prisma = new PrismaClient();

async function updateOrgId(oldOrgId, newOrgId) {
  console.log('\n🔄 Updating Clerk Org ID for Telematics Data\n');
  console.log(`   Old Org ID: ${oldOrgId}`);
  console.log(`   New Org ID: ${newOrgId}\n`);

  try {
    // 1. Update TelematicsProviderAccount
    console.log('📋 Updating TelematicsProviderAccount...');
    const providerResult = await prisma.telematicsProviderAccount.updateMany({
      where: { clerkOrgId: oldOrgId },
      data: { clerkOrgId: newOrgId },
    });
    console.log(`   ✓ Updated ${providerResult.count} provider account(s)`);

    // 2. Update TelematicsVehicleMap
    console.log('📋 Updating TelematicsVehicleMap...');
    const vehicleMapResult = await prisma.telematicsVehicleMap.updateMany({
      where: { clerkOrgId: oldOrgId },
      data: { clerkOrgId: newOrgId },
    });
    console.log(`   ✓ Updated ${vehicleMapResult.count} vehicle mapping(s)`);

    // 3. Update TelematicsDailyMetric
    console.log('📋 Updating TelematicsDailyMetric...');
    const metricsResult = await prisma.telematicsDailyMetric.updateMany({
      where: { clerkOrgId: oldOrgId },
      data: { clerkOrgId: newOrgId },
    });
    console.log(`   ✓ Updated ${metricsResult.count} daily metric(s)`);

    // 4. Update Motive Raw Data Tables
    console.log('📋 Updating Motive Raw Data Tables...');
    
    const vehicleUtilResult = await prisma.motiveVehicleUtilization.updateMany({
      where: { clerkOrgId: oldOrgId },
      data: { clerkOrgId: newOrgId },
    });
    console.log(`   ✓ Updated ${vehicleUtilResult.count} vehicle utilization record(s)`);

    const driverUtilResult = await prisma.motiveDriverUtilization.updateMany({
      where: { clerkOrgId: oldOrgId },
      data: { clerkOrgId: newOrgId },
    });
    console.log(`   ✓ Updated ${driverUtilResult.count} driver utilization record(s)`);

    const idleEventsResult = await prisma.motiveIdleEvent.updateMany({
      where: { clerkOrgId: oldOrgId },
      data: { clerkOrgId: newOrgId },
    });
    console.log(`   ✓ Updated ${idleEventsResult.count} idle event(s)`);

    const drivingPeriodsResult = await prisma.motiveDrivingPeriod.updateMany({
      where: { clerkOrgId: oldOrgId },
      data: { clerkOrgId: newOrgId },
    });
    console.log(`   ✓ Updated ${drivingPeriodsResult.count} driving period(s)`);

    const geofencesResult = await prisma.motiveGeofence.updateMany({
      where: { clerkOrgId: oldOrgId },
      data: { clerkOrgId: newOrgId },
    });
    console.log(`   ✓ Updated ${geofencesResult.count} geofence(s)`);

    // 5. Update CustomerOrgMap
    console.log('📋 Updating CustomerOrgMap...');
    const orgMapResult = await prisma.customerOrgMap.updateMany({
      where: { clerkOrgId: oldOrgId },
      data: { clerkOrgId: newOrgId },
    });
    console.log(`   ✓ Updated ${orgMapResult.count} org mapping(s)`);

    // Summary
    const totalUpdated = 
      providerResult.count +
      vehicleMapResult.count +
      metricsResult.count +
      vehicleUtilResult.count +
      driverUtilResult.count +
      idleEventsResult.count +
      drivingPeriodsResult.count +
      geofencesResult.count +
      orgMapResult.count;

    console.log('\n✅ Migration Complete!');
    console.log(`   Total records updated: ${totalUpdated}`);
    console.log(`   Old Org ID: ${oldOrgId}`);
    console.log(`   New Org ID: ${newOrgId}\n`);

    // Verification
    console.log('🔍 Verification:');
    const oldRecords = await prisma.telematicsProviderAccount.count({
      where: { clerkOrgId: oldOrgId },
    });
    const newRecords = await prisma.telematicsProviderAccount.count({
      where: { clerkOrgId: newOrgId },
    });
    console.log(`   Old org ID records remaining: ${oldRecords}`);
    console.log(`   New org ID records: ${newRecords}`);

    if (oldRecords > 0) {
      console.log('\n⚠️  Warning: Some records with old org ID still exist!');
    } else {
      console.log('\n✅ All records successfully migrated!\n');
    }

  } catch (error) {
    console.error('\n❌ Error updating org ID:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length !== 2) {
  console.error('\n❌ Error: Missing arguments\n');
  console.log('Usage:');
  console.log('  pnpm tsx src/scripts/update-org-id.mjs <oldOrgId> <newOrgId>\n');
  console.log('Example:');
  console.log('  pnpm tsx src/scripts/update-org-id.mjs org_2slAi3SqvSCzvqCJE3i2YtWQCsO org_2XXXXXXXXXXXX\n');
  process.exit(1);
}

const [oldOrgId, newOrgId] = args;

// Validate org IDs
if (!oldOrgId.startsWith('org_') || !newOrgId.startsWith('org_')) {
  console.error('\n❌ Error: Invalid org ID format\n');
  console.log('Org IDs must start with "org_"\n');
  process.exit(1);
}

// Confirmation prompt
console.log('\n⚠️  WARNING: This will update ALL records in the database!\n');
console.log(`   Old Org ID: ${oldOrgId}`);
console.log(`   New Org ID: ${newOrgId}\n`);
console.log('Press Ctrl+C to cancel, or wait 5 seconds to proceed...\n');

setTimeout(() => {
  updateOrgId(oldOrgId, newOrgId)
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}, 5000);
