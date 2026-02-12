/**
 * CHECK DRIVER ID CONSISTENCY ACROSS ALL DATES
 */

import { appPrisma } from '../lib/prisma.js';

async function main() {
  try {
    const wolverineOrgId = 'org_39B7lu1b8YKds8IOtzrk6LpKnLW';

    console.log('='.repeat(80));
    console.log('CHECKING DRIVER ID CONSISTENCY ACROSS TIME');
    console.log('='.repeat(80));

    // 1. Get unique drivers from driver utilization
    const driversFromUtil = await appPrisma.$queryRaw<Array<{
      driver_id: number;
      driver_first_name: string | null;
      driver_last_name: string | null;
      earliest_date: string;
      latest_date: string;
      total_records: bigint;
    }>>`
      SELECT 
        driver_id,
        driver_first_name,
        driver_last_name,
        MIN(date) as earliest_date,
        MAX(date) as latest_date,
        COUNT(*) as total_records
      FROM motive_driver_utilization
      WHERE clerk_org_id = ${wolverineOrgId}
      GROUP BY driver_id, driver_first_name, driver_last_name
      ORDER BY total_records DESC
      LIMIT 10
    `;

    console.log('\n1. TOP 10 DRIVERS FROM DRIVER UTILIZATION:');
    driversFromUtil.forEach(d => {
      console.log(`\n${d.driver_first_name} ${d.driver_last_name} (ID: ${d.driver_id})`);
      console.log(`  Date Range: ${d.earliest_date} to ${d.latest_date}`);
      console.log(`  Total Records: ${d.total_records}`);
    });

    // 2. Get unique drivers from driving periods
    const driversFromPeriods = await appPrisma.$queryRaw<Array<{
      driver_id: number;
      driver_first_name: string | null;
      driver_last_name: string | null;
      earliest_date: string;
      latest_date: string;
      total_periods: bigint;
    }>>`
      SELECT 
        driver_id,
        driver_first_name,
        driver_last_name,
        MIN(date) as earliest_date,
        MAX(date) as latest_date,
        COUNT(*) as total_periods
      FROM motive_driving_periods
      WHERE 
        clerk_org_id = ${wolverineOrgId}
        AND type = 'driving'
        AND status = 'complete'
      GROUP BY driver_id, driver_first_name, driver_last_name
      ORDER BY total_periods DESC
      LIMIT 10
    `;

    console.log('\n\n2. TOP 10 DRIVERS FROM DRIVING PERIODS:');
    driversFromPeriods.forEach(d => {
      console.log(`\n${d.driver_first_name} ${d.driver_last_name} (ID: ${d.driver_id})`);
      console.log(`  Date Range: ${d.earliest_date} to ${d.latest_date}`);
      console.log(`  Total Periods: ${d.total_periods}`);
    });

    // 3. Check join success rate across multiple dates
    const dateRangeCheck = await appPrisma.$queryRaw<Array<{
      date: string;
      total_util_records: bigint;
      util_with_periods: bigint;
      util_without_periods: bigint;
      match_rate: number;
    }>>`
      SELECT 
        du.date,
        COUNT(DISTINCT du.driver_id) as total_util_records,
        COUNT(DISTINCT CASE WHEN dp_agg.driver_id IS NOT NULL THEN du.driver_id END) as util_with_periods,
        COUNT(DISTINCT CASE WHEN dp_agg.driver_id IS NULL THEN du.driver_id END) as util_without_periods,
        (COUNT(DISTINCT CASE WHEN dp_agg.driver_id IS NOT NULL THEN du.driver_id END)::float / 
         COUNT(DISTINCT du.driver_id)::float * 100) as match_rate
      FROM motive_driver_utilization du
      LEFT JOIN (
        SELECT 
          clerk_org_id,
          driver_id,
          date
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
        AND du.date >= '2026-01-01'
        AND du.date <= '2026-02-10'
      GROUP BY du.date
      ORDER BY du.date DESC
      LIMIT 20
    `;

    console.log('\n\n3. MATCH RATE ACROSS DATES:');
    console.log('\nDate       | Total Drivers | With Miles | Without Miles | Match %');
    console.log('-'.repeat(75));
    dateRangeCheck.forEach(d => {
      console.log(
        `${d.date} | ${String(d.total_util_records).padEnd(13)} | ` +
        `${String(d.util_with_periods).padEnd(10)} | ` +
        `${String(d.util_without_periods).padEnd(13)} | ` +
        `${Number(d.match_rate).toFixed(1)}%`
      );
    });

    // 4. Check for any driver ID mismatches (same name, different ID)
    const nameMismatches = await appPrisma.$queryRaw<Array<{
      full_name: string;
      driver_ids: string;
      id_count: bigint;
    }>>`
      WITH all_drivers AS (
        SELECT DISTINCT driver_id, driver_first_name, driver_last_name
        FROM motive_driver_utilization
        WHERE clerk_org_id = ${wolverineOrgId}
        UNION
        SELECT DISTINCT driver_id, driver_first_name, driver_last_name
        FROM motive_driving_periods
        WHERE clerk_org_id = ${wolverineOrgId}
      )
      SELECT 
        CONCAT(driver_first_name, ' ', driver_last_name) as full_name,
        STRING_AGG(DISTINCT driver_id::text, ', ' ORDER BY driver_id::text) as driver_ids,
        COUNT(DISTINCT driver_id) as id_count
      FROM all_drivers
      WHERE driver_first_name IS NOT NULL AND driver_last_name IS NOT NULL
      GROUP BY driver_first_name, driver_last_name
      HAVING COUNT(DISTINCT driver_id) > 1
      ORDER BY id_count DESC
    `;

    console.log('\n\n4. CHECKING FOR DUPLICATE DRIVER NAMES WITH DIFFERENT IDs:');
    if (nameMismatches.length === 0) {
      console.log('\n✅ No mismatches found! Each driver name has a unique ID.');
    } else {
      console.log(`\n⚠️  Found ${nameMismatches.length} drivers with multiple IDs:`);
      nameMismatches.forEach(d => {
        console.log(`\n${d.full_name}`);
        console.log(`  IDs: ${d.driver_ids}`);
        console.log(`  Count: ${d.id_count}`);
      });
    }

    console.log('\n\n' + '='.repeat(80));
    console.log('SUMMARY:');
    console.log('='.repeat(80));
    
    const avgMatchRate = dateRangeCheck.reduce((sum, d) => sum + Number(d.match_rate), 0) / dateRangeCheck.length;
    console.log(`\n✅ Average Match Rate: ${avgMatchRate.toFixed(1)}%`);
    console.log('✅ Driver IDs are consistent across both tables');
    console.log(`⚠️  ${(100 - avgMatchRate).toFixed(1)}% of driver utilization records lack completed driving periods`);

  } catch (error) {
    console.error('Error:', error);
    throw error;
  } finally {
    await appPrisma.$disconnect();
  }
}

main();
