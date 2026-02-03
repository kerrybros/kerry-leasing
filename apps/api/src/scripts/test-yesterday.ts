/**
 * TEST YESTERDAY'S DATA
 * Pulls Motive data for yesterday only to verify API connection and data structure
 * 
 * Usage:
 *   npx tsx src/scripts/test-yesterday.ts
 */

import 'dotenv/config';
import { syncMotiveOrgForDate } from '../telematics/motive/syncService.js';
import { getAppPrisma } from '../lib/prisma.js';

async function testYesterday() {
  console.log(`\n🧪 TESTING MOTIVE API - YESTERDAY'S DATA ONLY\n`);

  const clerkOrgId = 'org_wolverine';
  const yesterday = getYesterdayDate();

  console.log(`  Organization: ${clerkOrgId}`);
  console.log(`  Date: ${yesterday}`);
  console.log(`  Timestamp: ${new Date().toISOString()}\n`);

  try {
    // Get API credentials
    const appPrisma = getAppPrisma();
    const providerAccount = await appPrisma.telematicsProviderAccount.findUnique({
      where: { clerkOrgId }
    });

    if (!providerAccount) {
      throw new Error(`No Motive provider account found for ${clerkOrgId}. Run setup script first.`);
    }

    if (providerAccount.status !== 'ACTIVE') {
      throw new Error(`Provider account is not active (status: ${providerAccount.status})`);
    }

    const apiKey = (providerAccount.credentialsJson as any).apiKey;
    if (!apiKey) {
      throw new Error(`No API key found in credentials`);
    }

    console.log(`✓ Found provider account`);
    console.log(`  API Key: ${apiKey.substring(0, 10)}...`);
    console.log(`  Status: ${providerAccount.status}\n`);

    // Sync yesterday's data
    console.log(`📥 Fetching data from Motive API...\n`);
    const result = await syncMotiveOrgForDate(clerkOrgId, apiKey, yesterday, false);

    if (!result.success) {
      throw new Error(result.error || 'Sync failed');
    }

    // Display results
    console.log(`\n✅ SUCCESS! Data retrieved and stored.\n`);
    console.log(`📊 RESULTS BY ENDPOINT:\n`);

    for (const endpointResult of result.results) {
      const emoji = endpointResult.errorCount > 0 ? '⚠️' : '✅';
      console.log(`${emoji} ${endpointResult.endpoint.padEnd(20)} | Records: ${endpointResult.recordCount.toString().padStart(3)} | New: ${endpointResult.newCount.toString().padStart(3)} | Updated: ${endpointResult.updatedCount.toString().padStart(3)}`);
    }

    console.log(`\n⏱️  Total time: ${Math.round(result.duration / 1000)}s\n`);

    // Query sample data from each table
    console.log(`📋 SAMPLE DATA FROM DATABASE:\n`);

    const vehicleUtil = await appPrisma.motiveVehicleUtilization.findMany({
      where: { clerkOrgId, date: yesterday },
      take: 3,
      select: {
        vin,
        vehicleNumber,
        utilizationPercentage,
        idleTime,
        drivingTime,
        totalDistance,
        totalFuel
      }
    });

    console.log(`Vehicle Utilization (showing ${vehicleUtil.length} of ${result.results[0]?.recordCount || 0}):`);
    vehicleUtil.forEach((v, i) => {
      console.log(`  ${i + 1}. VIN: ${v.vin || 'N/A'} | Vehicle: ${v.vehicleNumber || 'N/A'} | Util: ${v.utilizationPercentage || 0}% | Distance: ${v.totalDistance || 0} mi`);
    });

    const driverUtil = await appPrisma.motiveDriverUtilization.findMany({
      where: { clerkOrgId, date: yesterday },
      take: 3,
      select: {
        driverFirstName,
        driverLastName,
        utilization,
        idleTime,
        drivingTime
      }
    });

    console.log(`\nDriver Utilization (showing ${driverUtil.length} of ${result.results[1]?.recordCount || 0}):`);
    driverUtil.forEach((d, i) => {
      console.log(`  ${i + 1}. Driver: ${d.driverFirstName} ${d.driverLastName} | Util: ${d.utilization || 0}% | Driving: ${d.drivingTime || 0}s`);
    });

    const idleEvents = await appPrisma.motiveIdleEvent.findMany({
      where: { clerkOrgId, date: yesterday },
      take: 3,
      select: {
        vin,
        vehicleNumber,
        startTime,
        endTime,
        location,
        vehFuelStart,
        vehFuelEnd
      }
    });

    console.log(`\nIdle Events (showing ${idleEvents.length} of ${result.results[2]?.recordCount || 0}):`);
    idleEvents.forEach((e, i) => {
      const fuelUsed = (e.vehFuelEnd && e.vehFuelStart) ? (e.vehFuelStart - e.vehFuelEnd) / 1000 : 0;
      console.log(`  ${i + 1}. VIN: ${e.vin || 'N/A'} | Location: ${e.location || 'N/A'} | Fuel: ${fuelUsed.toFixed(2)}L`);
    });

    console.log(`\n✅ TEST COMPLETE!\n`);
    console.log(`📝 Next steps:`);
    console.log(`  - Review the data above to confirm it looks correct`);
    console.log(`  - Check database directly: SELECT * FROM motive_vehicle_utilization WHERE date = '${yesterday}' LIMIT 10;`);
    console.log(`  - If data looks good, run full backdate: pnpm backdate -- --org=${clerkOrgId} --start=2025-05-01 --end=2026-02-02\n`);

    await appPrisma.$disconnect();
  } catch (error: any) {
    console.error(`\n❌ TEST FAILED:`, error.message);
    if (error.stack) {
      console.error(`\nStack trace:`, error.stack);
    }
    process.exit(1);
  }
}

function getYesterdayDate(): string {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  return yesterday.toISOString().split('T')[0];
}

testYesterday();
