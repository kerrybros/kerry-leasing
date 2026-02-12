/**
 * ANALYZE DRIVER MILES FROM DRIVING PERIODS
 * 
 * Check what data we have in MotiveDrivingPeriod table
 * and how to calculate driver-level miles
 */

import { appPrisma } from '../lib/prisma.js';

async function main() {
  try {
    console.log('='.repeat(80));
    console.log('ANALYZING DRIVER MILES FROM DRIVING PERIODS');
    console.log('='.repeat(80));

    // Get the Wolverine org ID (the one with Motive data)
    const wolverineOrgId = 'org_39B7lu1b8YKds8IOtzrk6LpKnLW';

    // 1. Check sample driving periods data
    console.log('\n1. SAMPLE DRIVING PERIODS DATA:');
    const samplePeriods = await appPrisma.motiveDrivingPeriod.findMany({
      where: {
        clerkOrgId: wolverineOrgId,
        date: {
          gte: '2026-01-01',
          lte: '2026-02-10',
        },
      },
      take: 5,
      orderBy: { date: 'desc' },
      select: {
        date: true,
        driverId: true,
        driverFirstName: true,
        driverLastName: true,
        vehicleNumber: true,
        vin: true,
        startKilometers: true,
        endKilometers: true,
        distance: true,
        duration: true,
        type: true,
        status: true,
      },
    });

    console.log(`\nFound ${samplePeriods.length} sample periods:`);
    samplePeriods.forEach(p => {
      const kmDriven = p.endKilometers && p.startKilometers 
        ? (p.endKilometers - p.startKilometers).toFixed(2)
        : 'N/A';
      
      console.log(`\nDate: ${p.date}`);
      console.log(`  Driver: ${p.driverFirstName} ${p.driverLastName} (ID: ${p.driverId})`);
      console.log(`  Vehicle: ${p.vehicleNumber} (VIN: ${p.vin})`);
      console.log(`  Distance field: "${p.distance}"`);
      console.log(`  Start KM: ${p.startKilometers}, End KM: ${p.endKilometers}`);
      console.log(`  Calculated KM: ${kmDriven}`);
      console.log(`  Duration: ${p.duration}s, Type: ${p.type}, Status: ${p.status}`);
    });

    // 2. Aggregate by driver for a specific date
    console.log('\n\n2. DRIVER AGGREGATION FOR RECENT DATE:');
    const recentDate = '2026-02-02'; // Date we know has data
    
    console.log(`\nAggregating driving periods for ${recentDate}...`);
    
    const driverAggregations = await appPrisma.$queryRaw<Array<{
      driver_id: number;
      driver_first_name: string | null;
      driver_last_name: string | null;
      total_periods: bigint;
      total_duration_seconds: number;
      total_km_driven: number;
      total_miles_driven: number;
    }>>`
      SELECT 
        driver_id,
        driver_first_name,
        driver_last_name,
        COUNT(*) as total_periods,
        SUM(duration) as total_duration_seconds,
        SUM(end_kilometers - start_kilometers) as total_km_driven,
        SUM((end_kilometers - start_kilometers) * 0.621371) as total_miles_driven
      FROM motive_driving_periods
      WHERE 
        clerk_org_id = ${wolverineOrgId}
        AND date = ${recentDate}
        AND start_kilometers IS NOT NULL
        AND end_kilometers IS NOT NULL
        AND type = 'driving'
        AND status = 'complete'
      GROUP BY driver_id, driver_first_name, driver_last_name
      ORDER BY total_miles_driven DESC
    `;

    console.log(`\nFound ${driverAggregations.length} drivers with completed driving periods:`);
    driverAggregations.forEach(d => {
      console.log(`\n${d.driver_first_name} ${d.driver_last_name} (ID: ${d.driver_id})`);
      console.log(`  Periods: ${d.total_periods}`);
      console.log(`  Duration: ${(Number(d.total_duration_seconds) / 3600).toFixed(2)} hours`);
      console.log(`  Kilometers: ${Number(d.total_km_driven).toFixed(2)} km`);
      console.log(`  Miles: ${Number(d.total_miles_driven).toFixed(2)} mi`);
    });

    // 3. Check if we can join with driver utilization
    console.log('\n\n3. JOIN WITH DRIVER UTILIZATION:');
    
    const joinedData = await appPrisma.$queryRaw<Array<{
      driver_id: number;
      driver_first_name: string | null;
      driver_last_name: string | null;
      date: string;
      // From driver utilization
      utilization: number | null;
      idle_time: number | null;
      driving_time: number | null;
      idle_fuel: number | null;
      driving_fuel: number | null;
      // From driving periods (aggregated)
      total_miles_driven: number | null;
      total_periods: bigint | null;
    }>>`
      SELECT 
        du.driver_id,
        du.driver_first_name,
        du.driver_last_name,
        du.date,
        du.utilization,
        du.idle_time,
        du.driving_time,
        du.idle_fuel,
        du.driving_fuel,
        dp_agg.total_miles_driven,
        dp_agg.total_periods
      FROM motive_driver_utilization du
      LEFT JOIN (
        SELECT 
          clerk_org_id,
          driver_id,
          date,
          COUNT(*) as total_periods,
          SUM((end_kilometers - start_kilometers) * 0.621371) as total_miles_driven
        FROM motive_driving_periods
        WHERE 
          start_kilometers IS NOT NULL
          AND end_kilometers IS NOT NULL
          AND type = 'driving'
          AND status = 'complete'
        GROUP BY clerk_org_id, driver_id, date
      ) dp_agg ON 
        du.clerk_org_id = dp_agg.clerk_org_id 
        AND du.driver_id = dp_agg.driver_id 
        AND du.date = dp_agg.date
      WHERE 
        du.clerk_org_id = ${wolverineOrgId}
        AND du.date = ${recentDate}
      ORDER BY total_miles_driven DESC NULLS LAST
    `;

    console.log(`\nJoined ${joinedData.length} driver utilization records with driving periods:`);
    joinedData.forEach(d => {
      const totalFuel = (d.idle_fuel || 0) + (d.driving_fuel || 0);
      const mpg = d.total_miles_driven && totalFuel > 0 
        ? (d.total_miles_driven / totalFuel).toFixed(2) 
        : 'N/A';

      console.log(`\n${d.driver_first_name} ${d.driver_last_name} (ID: ${d.driver_id})`);
      console.log(`  Miles: ${d.total_miles_driven ? Number(d.total_miles_driven).toFixed(2) : 'N/A'} mi (from ${d.total_periods || 0} periods)`);
      console.log(`  Utilization: ${d.utilization || 'N/A'}%`);
      console.log(`  Idle Time: ${d.idle_time ? (d.idle_time / 3600).toFixed(2) : 'N/A'} hrs`);
      console.log(`  Driving Time: ${d.driving_time ? (d.driving_time / 3600).toFixed(2) : 'N/A'} hrs`);
      console.log(`  Total Fuel: ${totalFuel.toFixed(2)} gal`);
      console.log(`  MPG: ${mpg}`);
    });

    // 4. Summary
    console.log('\n\n' + '='.repeat(80));
    console.log('SUMMARY:');
    console.log('='.repeat(80));
    console.log('\n✅ We CAN calculate driver miles from MotiveDrivingPeriod table');
    console.log('✅ We CAN join with MotiveDriverUtilization on (clerkOrgId, driverId, date)');
    console.log('✅ We CAN calculate MPG using: miles / (idle_fuel + driving_fuel)');
    console.log('\nNEXT STEPS:');
    console.log('1. Update /telematics/motive/driver-utilization endpoint to include aggregated miles');
    console.log('2. Calculate MPG on the API side');
    console.log('3. Return enriched driver data to frontend');

  } catch (error) {
    console.error('Error analyzing driver miles:', error);
    throw error;
  } finally {
    await appPrisma.$disconnect();
  }
}

main();
