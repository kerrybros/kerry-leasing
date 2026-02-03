/**
 * TEST YESTERDAY'S DATA
 * Pulls Motive data for yesterday only to verify API connection and data structure
 * 
 * Usage:
 *   node src/scripts/test-yesterday.mjs
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { MotiveClient } from '../telematics/motive/client.js';
import { fetchVehicleUtilization } from '../telematics/motive/endpoints/vehicleUtilization.js';
import { fetchDriverUtilization } from '../telematics/motive/endpoints/driverUtilization.js';
import { fetchIdleEvents } from '../telematics/motive/endpoints/idleEvents.js';
import { fetchDrivingPeriods } from '../telematics/motive/endpoints/drivingPeriods.js';
import { fetchGeofences } from '../telematics/motive/endpoints/geofences.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env
dotenv.config({ path: join(__dirname, '../../.env') });

async function testYesterday() {
  console.log(`\n🧪 TESTING MOTIVE API - YESTERDAY'S DATA ONLY\n`);

  const clerkOrgId = 'org_wolverine';
  const yesterday = getYesterdayDate();

  console.log(`  Organization: ${clerkOrgId}`);
  console.log(`  Date: ${yesterday}`);
  console.log(`  Timestamp: ${new Date().toISOString()}\n`);

  try {
    // Get API credentials
    const { PrismaClient } = await import('../generated/app-client/index.js');
    const appPrisma = new PrismaClient({
      datasources: { db: { url: process.env.APP_DATABASE_URL } }
    });

    const providerAccount = await appPrisma.telematicsProviderAccount.findUnique({
      where: { clerkOrgId }
    });

    if (!providerAccount) {
      throw new Error(`No Motive provider account found for ${clerkOrgId}. Run setup script first.`);
    }

    const apiKey = providerAccount.credentialsJson.apiKey;
    console.log(`✓ Found provider account`);
    console.log(`  API Key: ${apiKey.substring(0, 10)}...`);
    console.log(`  Status: ${providerAccount.status}\n`);

    // Create Motive API client
    const client = new MotiveClient(apiKey);

    // Fetch from each endpoint
    console.log(`📥 Fetching data from Motive API...\n`);

    console.log(`1. Vehicle Utilization...`);
    const vehicleUtil = await fetchVehicleUtilization(client, yesterday);
    console.log(`   ✓ Got ${vehicleUtil.length} records\n`);

    console.log(`2. Driver Utilization...`);
    const driverUtil = await fetchDriverUtilization(client, yesterday);
    console.log(`   ✓ Got ${driverUtil.length} records\n`);

    console.log(`3. Idle Events...`);
    const idleEvents = await fetchIdleEvents(client, yesterday);
    console.log(`   ✓ Got ${idleEvents.length} records\n`);

    console.log(`4. Driving Periods...`);
    const drivingPeriods = await fetchDrivingPeriods(client, yesterday);
    console.log(`   ✓ Got ${drivingPeriods.length} records\n`);

    console.log(`5. Geofences...`);
    const geofences = await fetchGeofences(client);
    console.log(`   ✓ Got ${geofences.length} records\n`);

    // Display sample data
    console.log(`\n📊 SAMPLE DATA:\n`);

    console.log(`Vehicle Utilization (showing 3 of ${vehicleUtil.length}):`);
    vehicleUtil.slice(0, 3).forEach((v, i) => {
      console.log(`  ${i + 1}. Vehicle ID: ${v.vehicle?.id || 'N/A'} | VIN: ${v.vehicle?.vin || 'N/A'} | Number: ${v.vehicle?.number || 'N/A'}`);
      console.log(`     Utilization: ${v.utilization || 0}% | Idle: ${v.idle_time || 0}s | Driving: ${v.driving_time || 0}s`);
      console.log(`     Distance: ${v.total_distance || 0} mi | Fuel: ${v.total_fuel || 0} gal`);
      console.log(`     Raw data keys:`, Object.keys(v));
    });

    console.log(`\nDriver Utilization (showing 3 of ${driverUtil.length}):`);
    driverUtil.slice(0, 3).forEach((d, i) => {
      console.log(`  ${i + 1}. Driver: ${d.driver?.first_name || 'N/A'} ${d.driver?.last_name || 'N/A'} | ID: ${d.driver?.id || 'N/A'}`);
      console.log(`     Utilization: ${d.utilization || 0}% | Idle: ${d.idle_time || 0}s | Driving: ${d.driving_time || 0}s`);
      console.log(`     Idle Fuel: ${d.idle_fuel || 0} gal | Driving Fuel: ${d.driving_fuel || 0} gal`);
      console.log(`     Raw data keys:`, Object.keys(d));
    });

    console.log(`\nIdle Events (showing 3 of ${idleEvents.length}):`);
    idleEvents.slice(0, 3).forEach((e, i) => {
      const fuelUsed = (e.veh_fuel_start && e.veh_fuel_end) ? ((e.veh_fuel_start - e.veh_fuel_end) / 1000).toFixed(2) : '0';
      console.log(`  ${i + 1}. Event ID: ${e.id} | VIN: ${e.vehicle?.vin || 'N/A'} | Vehicle: ${e.vehicle?.number || 'N/A'}`);
      console.log(`     Time: ${e.start_time} to ${e.end_time}`);
      console.log(`     Location: ${e.location || 'N/A'} | Fuel: ${fuelUsed}L`);
      console.log(`     Raw data keys:`, Object.keys(e));
    });

    console.log(`\nDriving Periods (showing 3 of ${drivingPeriods.length}):`);
    drivingPeriods.slice(0, 3).forEach((p, i) => {
      console.log(`  ${i + 1}. Period ID: ${p.id} | VIN: ${p.vehicle?.vin || 'N/A'} | Status: ${p.status || 'N/A'}`);
      console.log(`     Driver: ${p.driver?.first_name || 'N/A'} ${p.driver?.last_name || 'N/A'}`);
      console.log(`     From: ${p.origin || 'N/A'} → To: ${p.destination || 'N/A'}`);
      console.log(`     Distance: ${p.distance || 'N/A'} | Duration: ${p.duration || 0}s`);
      console.log(`     Raw data keys:`, Object.keys(p));
    });

    console.log(`\nGeofences (showing 3 of ${geofences.length}):`);
    geofences.slice(0, 3).forEach((g, i) => {
      console.log(`  ${i + 1}. ${g.name} | ID: ${g.id} | Status: ${g.status}`);
      console.log(`     Category: ${g.category || 'N/A'} | Points: ${g.location_points?.length || 0}`);
      console.log(`     Raw data keys:`, Object.keys(g));
    });

    console.log(`\n✅ TEST COMPLETE - API CONNECTION SUCCESSFUL!\n`);
    console.log(`📋 SUMMARY:`);
    console.log(`  - Vehicle Utilization: ${vehicleUtil.length} records`);
    console.log(`  - Driver Utilization: ${driverUtil.length} records`);
    console.log(`  - Idle Events: ${idleEvents.length} records`);
    console.log(`  - Driving Periods: ${drivingPeriods.length} records`);
    console.log(`  - Geofences: ${geofences.length} records`);
    console.log(`  - Total: ${vehicleUtil.length + driverUtil.length + idleEvents.length + drivingPeriods.length + geofences.length} records\n`);

    console.log(`📝 Does this data look correct? (Y/n)`);
    console.log(`\nIf yes, run full backdate:`);
    console.log(`  pnpm backdate -- --org=${clerkOrgId} --start=2025-05-01 --end=2026-02-02\n`);

    await appPrisma.$disconnect();
  } catch (error) {
    console.error(`\n❌ TEST FAILED:`, error.message);
    if (error.stack) {
      console.error(`\nStack trace:`, error.stack);
    }
    process.exit(1);
  }
}

function getYesterdayDate() {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  return yesterday.toISOString().split('T')[0];
}

testYesterday();
