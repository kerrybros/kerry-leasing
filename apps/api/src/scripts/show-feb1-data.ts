/**
 * SHOW FEBRUARY 1 DATA
 * Display the Samsara data we pulled for Feb 1, 2026
 */

import { appPrisma } from '../lib/prisma.js';

async function main() {
  console.log('\n📊 SAMSARA DATA FOR FEBRUARY 2, 2026\n');
  console.log('═'.repeat(80));
  console.log('');

  const data = await appPrisma.samsaraRawData.findMany({
    where: {
      clerkOrgId: 'org_39RQY3qNO861ScQb0ZLFSUIFZkN',
      date: '2026-02-02'
    },
    orderBy: {
      vehicleName: 'asc'
    }
  });

  console.log(`Found ${data.length} vehicles for February 2, 2026\n`);

  for (const vehicle of data) {
    const raw = vehicle.rawResponse as any;
    
    // Check if we have converted metrics (new format) or need to calculate (old format)
    let converted;
    if (raw.convertedMetrics) {
      converted = raw.convertedMetrics;
    } else {
      // Old format - skip these records or calculate on the fly
      console.log(`⚠️  Vehicle: ${vehicle.vehicleName} - Old data format, skipping...`);
      console.log('');
      continue;
    }

    console.log(`Vehicle: ${vehicle.vehicleName} (VIN: ${vehicle.vin || 'No VIN'})`);
    console.log('─'.repeat(80));
    console.log(`  Distance:        ${converted.milesDriven.toFixed(2)} miles`);
    console.log(`  Fuel Consumed:   ${converted.fuelGallons.toFixed(2)} gallons`);
    console.log(`  Fuel Economy:    ${converted.avgMpg.toFixed(2)} MPG`);
    console.log(`  Engine Hours:    ${converted.engineHours.toFixed(2)} hours`);
    console.log(`  Idle Time:       ${converted.idleMinutes.toFixed(0)} minutes (${(converted.idleMinutes / 60).toFixed(2)} hours)`);
    console.log('');
    console.log(`  Raw Samsara Values:`);
    console.log(`    - Distance: ${raw.distanceTraveledMeters} meters`);
    console.log(`    - Fuel: ${raw.fuelConsumedMl} ml`);
    console.log(`    - Engine Runtime: ${raw.engineRunTimeDurationMs} ms`);
    console.log(`    - Idle Duration: ${raw.engineIdleTimeDurationMs} ms`);
    console.log(`    - MPGe (Samsara): ${raw.efficiencyMpge.toFixed(2)}`);
    
    if (raw.estCarbonEmissionsKg) {
      console.log(`    - Carbon Emissions: ${raw.estCarbonEmissionsKg.toFixed(2)} kg CO₂`);
    }
    if (raw.estFuelEnergyCost) {
      console.log(`    - Fuel Cost: $${raw.estFuelEnergyCost.amount.toFixed(2)} ${raw.estFuelEnergyCost.currencyCode}`);
    }
    console.log('');
    console.log('═'.repeat(80));
    console.log('');
  }

  // Summary - only include vehicles with new format data
  const validData = data.filter(v => (v.rawResponse as any).convertedMetrics);
  
  const totalMiles = validData.reduce((sum, v) => {
    const metrics = (v.rawResponse as any).convertedMetrics;
    return sum + metrics.milesDriven;
  }, 0);

  const totalFuel = validData.reduce((sum, v) => {
    const metrics = (v.rawResponse as any).convertedMetrics;
    return sum + metrics.fuelGallons;
  }, 0);

  const totalEngineHours = validData.reduce((sum, v) => {
    const metrics = (v.rawResponse as any).convertedMetrics;
    return sum + metrics.engineHours;
  }, 0);

  const totalIdleMinutes = validData.reduce((sum, v) => {
    const metrics = (v.rawResponse as any).convertedMetrics;
    return sum + metrics.idleMinutes;
  }, 0);

  console.log(`📈 FLEET TOTALS FOR FEBRUARY 2, 2026 (${validData.length} vehicles with complete data):`);
  console.log('─'.repeat(80));
  console.log(`  Total Distance:      ${totalMiles.toFixed(2)} miles`);
  console.log(`  Total Fuel:          ${totalFuel.toFixed(2)} gallons`);
  console.log(`  Fleet Average MPG:   ${(totalMiles / totalFuel).toFixed(2)} MPG`);
  console.log(`  Total Engine Hours:  ${totalEngineHours.toFixed(2)} hours`);
  console.log(`  Total Idle Time:     ${totalIdleMinutes.toFixed(0)} minutes (${(totalIdleMinutes / 60).toFixed(2)} hours)`);
  console.log(`  Idle %:              ${((totalIdleMinutes / 60) / totalEngineHours * 100).toFixed(1)}%`);
  console.log('');
  console.log('═'.repeat(80));
  console.log('');
  console.log('💡 To verify in Samsara:');
  console.log('   1. Go to Samsara Dashboard → Reports → Fuel & Energy');
  console.log('   2. Set date range: Feb 2, 2026 00:00 to Feb 2, 2026 23:59 (EST)');
  console.log('   3. Compare the distance, fuel, and efficiency for each vehicle');
  console.log('');
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
