/**
 * TEST SAMSARA FUEL-ENERGY ENDPOINT
 * Tests the fuel-energy report to determine if it provides the data we need
 */

import https from 'https';

const SAMSARA_API_TOKEN = process.env.SAMSARA_API_TOKEN;
if (!SAMSARA_API_TOKEN) {
  console.error('Set SAMSARA_API_TOKEN in env to run this script.');
  process.exit(1);
}

async function testFuelEnergyEndpoint() {
  console.log('\n🧪 Testing Samsara Fuel-Energy Endpoint\n');
  console.log('═'.repeat(70));
  console.log('');

  const startDate = '2026-02-01T19:00:00Z';
  const endDate = '2026-02-02T19:00:00Z';
  const energyType = 'fuel';

  const url = `https://api.samsara.com/fleet/reports/vehicles/fuel-energy?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}&energyType=${energyType}`;

  console.log('📡 Request Details:');
  console.log(`   URL: ${url}`);
  console.log(`   Start Date: ${startDate}`);
  console.log(`   End Date: ${endDate}`);
  console.log(`   Energy Type: ${energyType}`);
  console.log('');

  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'accept': 'application/json',
        'authorization': `Bearer ${SAMSARA_API_TOKEN}`
      }
    }, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        console.log(`✅ Response Status: ${res.statusCode}`);
        console.log('');

        try {
          const jsonData = JSON.parse(data);
          
          console.log('📊 Response Structure:');
          console.log(JSON.stringify(jsonData, null, 2));
          console.log('');

          // Analyze the data structure
          if (jsonData.data && jsonData.data.vehicleReports && Array.isArray(jsonData.data.vehicleReports)) {
            console.log(`✅ Found ${jsonData.data.vehicleReports.length} vehicle records`);
            console.log('');

            if (jsonData.data.vehicleReports.length > 0) {
              const firstVehicle = jsonData.data.vehicleReports[0];
              console.log('🚛 Sample Vehicle Data (first vehicle):');
              console.log(JSON.stringify(firstVehicle, null, 2));
              console.log('');

              // Analyze available fields
              console.log('📋 Available Fields in Each Vehicle Record:');
              Object.keys(firstVehicle).forEach(key => {
                const value = firstVehicle[key];
                const type = typeof value;
                const preview = type === 'object' && value !== null
                  ? JSON.stringify(value).substring(0, 100) + '...'
                  : String(value);
                console.log(`   • ${key} (${type}): ${preview}`);
              });
              console.log('');

              // Check for key metrics
              console.log('🎯 Key Metrics Analysis:');
              console.log('');
              
              // Distance/Odometer
              if (firstVehicle.distanceTraveledMeters !== undefined) {
                const distanceMiles = firstVehicle.distanceTraveledMeters / 1609.34;
                console.log('   ✅ DISTANCE DATA:');
                console.log(`      - Distance Traveled: ${firstVehicle.distanceTraveledMeters} meters (${distanceMiles.toFixed(2)} miles)`);
              } else {
                console.log('   ⚠️  No distance data found');
              }
              console.log('');

              // Fuel
              if (firstVehicle.fuelConsumedMl !== undefined) {
                const fuelGallons = firstVehicle.fuelConsumedMl / 3785.41;
                const efficiencyMpg = firstVehicle.efficiencyMpge || 'N/A';
                console.log('   ✅ FUEL DATA:');
                console.log(`      - Fuel Consumed: ${firstVehicle.fuelConsumedMl} ml (${fuelGallons.toFixed(2)} gallons)`);
                console.log(`      - Efficiency: ${efficiencyMpg} MPGe`);
              } else {
                console.log('   ⚠️  No fuel data found');
              }
              console.log('');

              // Engine Hours
              if (firstVehicle.engineRunTimeDurationMs !== undefined) {
                const engineHours = firstVehicle.engineRunTimeDurationMs / 1000 / 60 / 60;
                console.log('   ✅ ENGINE HOURS DATA:');
                console.log(`      - Engine Runtime: ${firstVehicle.engineRunTimeDurationMs} ms (${engineHours.toFixed(2)} hours)`);
              } else {
                console.log('   ⚠️  No engine hours data found');
              }
              console.log('');

              // Idle Time
              if (firstVehicle.engineIdleTimeDurationMs !== undefined) {
                const idleMinutes = firstVehicle.engineIdleTimeDurationMs / 1000 / 60;
                const idleHours = idleMinutes / 60;
                console.log('   ✅ IDLE TIME DATA:');
                console.log(`      - Idle Duration: ${firstVehicle.engineIdleTimeDurationMs} ms (${idleMinutes.toFixed(2)} minutes / ${idleHours.toFixed(2)} hours)`);
              } else {
                console.log('   ⚠️  No idle time data found');
              }
              console.log('');

              // Vehicle identification
              console.log('   ✅ VEHICLE IDENTIFICATION:');
              if (firstVehicle.vehicle?.id) console.log(`      - Vehicle ID: ${firstVehicle.vehicle.id}`);
              if (firstVehicle.vehicle?.name) console.log(`      - Vehicle Name: ${firstVehicle.vehicle.name}`);
              if (firstVehicle.vehicle?.externalIds?.['samsara.vin']) console.log(`      - VIN: ${firstVehicle.vehicle.externalIds['samsara.vin']}`);
            }

            console.log('');
            console.log('═'.repeat(70));
            console.log('');
            console.log('💡 COMPATIBILITY ASSESSMENT:');
            console.log('');
            console.log('Our APIs normalize from raw data to:');
            console.log('   • milesDriven (miles)');
            console.log('   • idleMinutes (minutes)');
            console.log('   • fuelGallons (gallons)');
            console.log('   • avgMpg (calculated)');
            console.log('   • engineHours (hours)');
            console.log('');

            if (jsonData.data.vehicleReports.length > 0) {
              const sample = jsonData.data.vehicleReports[0];
              console.log('This endpoint provides:');
              
              const hasDistance = sample.distanceTraveledMeters !== undefined;
              const hasFuel = sample.fuelConsumedMl !== undefined;
              const hasEngine = sample.engineRunTimeDurationMs !== undefined;
              const hasIdle = sample.engineIdleTimeDurationMs !== undefined;
              const hasEfficiency = sample.efficiencyMpge !== undefined;
              
              console.log(`   ${hasDistance ? '✅' : '❌'} Distance traveled (in meters - easily converted to miles)`);
              console.log(`   ${hasFuel ? '✅' : '❌'} Fuel consumed (in ml - easily converted to gallons)`);
              console.log(`   ${hasEngine ? '✅' : '❌'} Engine runtime (in ms - easily converted to hours)`);
              console.log(`   ${hasIdle ? '✅' : '❌'} Idle time (in ms - easily converted to minutes)`);
              console.log(`   ${hasEfficiency ? '✅' : '❌'} Fuel efficiency (MPGe provided directly)`);
              console.log('');

              console.log('📐 Unit Conversions Needed:');
              console.log('   • Distance: meters → miles (divide by 1609.34)');
              console.log('   • Fuel: milliliters → gallons (divide by 3785.41)');
              console.log('   • Engine time: milliseconds → hours (divide by 3,600,000)');
              console.log('   • Idle time: milliseconds → minutes (divide by 60,000)');
              console.log('');

              if (hasDistance && hasFuel && hasEngine && hasIdle) {
                console.log('✅ VERDICT: This endpoint provides ALL needed metrics!');
                console.log('');
                console.log('Benefits:');
                console.log('   • Single API call for all vehicle fuel/energy data');
                console.log('   • Includes MPGe efficiency metric');
                console.log('   • Has carbon emissions and cost estimates');
                console.log('   • Provides VIN for vehicle matching');
                console.log('');
                console.log('Data Quality:');
                const distMiles = sample.distanceTraveledMeters / 1609.34;
                const fuelGal = sample.fuelConsumedMl / 3785.41;
                const calcMpg = distMiles / fuelGal;
                console.log(`   • Sample calculation for vehicle ${sample.vehicle.name}:`);
                console.log(`     - Distance: ${distMiles.toFixed(2)} miles`);
                console.log(`     - Fuel: ${fuelGal.toFixed(2)} gallons`);
                console.log(`     - Calculated MPG: ${calcMpg.toFixed(2)}`);
                console.log(`     - API reported MPGe: ${sample.efficiencyMpge.toFixed(2)}`);
                console.log(`     - Match: ${Math.abs(calcMpg - sample.efficiencyMpge) < 0.5 ? '✅ Very close!' : '⚠️  Slight difference (normal)'}`);
              } else {
                console.log('❌ VERDICT: Missing critical metrics for our use case');
                console.log('   Missing: ' + [
                  !hasDistance ? 'distance' : null,
                  !hasFuel ? 'fuel' : null,
                  !hasEngine ? 'engine hours' : null,
                  !hasIdle ? 'idle time' : null
                ].filter(Boolean).join(', '));
              }
            }
          } else {
            console.log('⚠️  Unexpected data structure - vehicleReports not found');
            console.log('Response keys:', Object.keys(jsonData.data || {}));
          }

          console.log('');
          resolve(jsonData);
        } catch (error) {
          console.error('❌ Error parsing response:', error);
          console.log('Raw response:', data);
          reject(error);
        }
      });
    });

    req.on('error', (error) => {
      console.error('❌ Request error:', error);
      reject(error);
    });

    req.end();
  });
}

testFuelEnergyEndpoint()
  .then(() => {
    console.log('✅ Test complete!');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Test failed:', error);
    process.exit(1);
  });
