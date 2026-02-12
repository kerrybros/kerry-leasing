/**
 * COMPARE SAMSARA UI vs OUR DATA
 * Analyze discrepancies between Samsara dashboard and our pulled data
 */

import { appPrisma } from '../lib/prisma.js';

async function main() {
  console.log('\n🔍 COMPARING SAMSARA UI DATA vs OUR DATABASE\n');
  console.log('═'.repeat(80));
  console.log('');

  // From the Samsara UI screenshot for Feb 2:
  const samsaraUiData = [
    { vehicle: '826', efficiency: 7.47, fuel: 16.22, distance: 121.18, engineTime: 735.31, idleTime: 463.52 },
    { vehicle: '48', efficiency: 7.14, fuel: 11.75, distance: 83.97, engineTime: 388.07, idleTime: 173.72 },
    { vehicle: '387', efficiency: 13.74, fuel: 4.65, distance: 63.88, engineTime: 129.02, idleTime: 4.37 },
    { vehicle: '140', efficiency: 7.34, fuel: 16.64, distance: 122.22, engineTime: 483.27, idleTime: 256.57 },
    { vehicle: '825', efficiency: 10.1, fuel: 30.91, distance: 312.3, engineTime: 460.77, idleTime: 47.3 },
    { vehicle: '205', efficiency: 8.43, fuel: 15.45, distance: 130.27, engineTime: 281.11, idleTime: 52.7 },
    { vehicle: '78', efficiency: 7.49, fuel: 14.4, distance: 107.81, engineTime: 472.06, idleTime: 271.55 },
    { vehicle: '54', efficiency: 5.85, fuel: 21.79, distance: 127.41, engineTime: 623.71, idleTime: 369.05 },
    { vehicle: '824', efficiency: 8.45, fuel: 47.95, distance: 404.95, engineTime: 738.87, idleTime: 265.76 },
  ];

  console.log('📊 SAMSARA UI DATA (from screenshot):');
  console.log('─'.repeat(80));
  samsaraUiData.forEach(v => {
    console.log(`  ${v.vehicle.padEnd(5)} | ${v.distance.toFixed(2).padStart(8)} mi | ${v.fuel.toFixed(2).padStart(8)} gal | ${v.efficiency.toFixed(2).padStart(6)} MPG`);
  });
  console.log('');

  // Get our Feb 2 data
  const ourFeb2Data = await appPrisma.samsaraRawData.findMany({
    where: {
      clerkOrgId: 'org_39RQY3qNO861ScQb0ZLFSUIFZkN',
      date: '2026-02-02'
    },
    orderBy: {
      vehicleName: 'asc'
    }
  });

  // Get our Feb 1 data
  const ourFeb1Data = await appPrisma.samsaraRawData.findMany({
    where: {
      clerkOrgId: 'org_39RQY3qNO861ScQb0ZLFSUIFZkN',
      date: '2026-02-01'
    },
    orderBy: {
      vehicleName: 'asc'
    }
  });

  console.log('📊 OUR FEBRUARY 2 DATA:');
  console.log('─'.repeat(80));
  ourFeb2Data
    .filter(v => (v.rawResponse as any).convertedMetrics)
    .forEach(v => {
      const metrics = (v.rawResponse as any).convertedMetrics;
      console.log(`  ${v.vehicleName?.padEnd(5)} | ${metrics.milesDriven.toFixed(2).padStart(8)} mi | ${metrics.fuelGallons.toFixed(2).padStart(8)} gal | ${metrics.avgMpg.toFixed(2).padStart(6)} MPG`);
    });
  console.log('');

  console.log('📊 OUR FEBRUARY 1 DATA:');
  console.log('─'.repeat(80));
  ourFeb1Data
    .filter(v => (v.rawResponse as any).convertedMetrics)
    .forEach(v => {
      const metrics = (v.rawResponse as any).convertedMetrics;
      console.log(`  ${v.vehicleName?.padEnd(5)} | ${metrics.milesDriven.toFixed(2).padStart(8)} mi | ${metrics.fuelGallons.toFixed(2).padStart(8)} gal | ${metrics.avgMpg.toFixed(2).padStart(6)} MPG`);
    });
  console.log('');

  // Check for matches
  console.log('🔍 ANALYSIS:');
  console.log('─'.repeat(80));
  
  for (const uiVehicle of samsaraUiData) {
    // Check Feb 2 data
    const ourFeb2Vehicle = ourFeb2Data.find(v => 
      v.vehicleName?.replace(/^0+/, '') === uiVehicle.vehicle.replace(/^0+/, '')
    );
    
    // Check Feb 1 data
    const ourFeb1Vehicle = ourFeb1Data.find(v => 
      v.vehicleName?.replace(/^0+/, '') === uiVehicle.vehicle.replace(/^0+/, '')
    );

    const feb2Metrics = ourFeb2Vehicle ? (ourFeb2Vehicle.rawResponse as any).convertedMetrics : null;
    const feb1Metrics = ourFeb1Vehicle ? (ourFeb1Vehicle.rawResponse as any).convertedMetrics : null;

    console.log(`\nVehicle ${uiVehicle.vehicle}:`);
    console.log(`  Samsara UI:  ${uiVehicle.distance.toFixed(2)} mi, ${uiVehicle.fuel.toFixed(2)} gal, ${uiVehicle.efficiency.toFixed(2)} MPG`);
    
    if (feb2Metrics) {
      const distMatch = Math.abs(feb2Metrics.milesDriven - uiVehicle.distance) < 1;
      const fuelMatch = Math.abs(feb2Metrics.fuelGallons - uiVehicle.fuel) < 1;
      console.log(`  Our Feb 2:   ${feb2Metrics.milesDriven.toFixed(2)} mi, ${feb2Metrics.fuelGallons.toFixed(2)} gal, ${feb2Metrics.avgMpg.toFixed(2)} MPG ${distMatch && fuelMatch ? '✅' : '❌'}`);
    } else {
      console.log(`  Our Feb 2:   No data`);
    }
    
    if (feb1Metrics) {
      const distMatch = Math.abs(feb1Metrics.milesDriven - uiVehicle.distance) < 1;
      const fuelMatch = Math.abs(feb1Metrics.fuelGallons - uiVehicle.fuel) < 1;
      console.log(`  Our Feb 1:   ${feb1Metrics.milesDriven.toFixed(2)} mi, ${feb1Metrics.fuelGallons.toFixed(2)} gal, ${feb1Metrics.avgMpg.toFixed(2)} MPG ${distMatch && fuelMatch ? '✅ MATCH!' : '❌'}`);
    } else {
      console.log(`  Our Feb 1:   No data`);
    }
  }

  console.log('\n');
  console.log('═'.repeat(80));
  console.log('\n💡 CONCLUSION:');
  console.log('   If Samsara UI data matches our Feb 1 data, then our timezone offset is wrong.');
  console.log('   We may be pulling data for the NEXT day instead of the requested day.');
  console.log('');
  console.log('🔧 POSSIBLE FIX:');
  console.log('   Instead of: startDate=2026-02-02T05:00:00Z to endDate=2026-02-03T04:59:59Z');
  console.log('   We may need: startDate=2026-02-02T00:00:00Z to endDate=2026-02-02T23:59:59Z');
  console.log('   Or Samsara may handle timezone internally based on fleet settings.');
  console.log('');
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
