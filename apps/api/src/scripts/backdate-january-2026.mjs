/**
 * Backdate Motive Data for January 2026
 * Pulls data for all days in January 2026 for Wolverine
 */

import 'dotenv/config';
import { syncMotiveOrgForDate } from '../telematics/motive/syncService.js';

const WOLVERINE_ORG_ID = 'org_2slAi3SqvSCzvqCJE3i2YtWQCsO';
const MOTIVE_API_KEY = '11dca31e-79b0-4351-9684-9ae465a3b5ce';

// January 2026: Jan 1 - Jan 31
const START_DATE = '2026-01-01';
const END_DATE = '2026-01-31';

function getDatesBetween(startDate, endDate) {
  const dates = [];
  const current = new Date(startDate);
  const end = new Date(endDate);
  
  while (current <= end) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }
  
  return dates;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function backdateJanuary2026() {
  console.log(`\n🚀 BACKDATE SCRIPT: JANUARY 2026\n`);
  console.log(`Organization: Wolverine (${WOLVERINE_ORG_ID})`);
  console.log(`Date Range: ${START_DATE} to ${END_DATE}`);
  console.log(`Started: ${new Date().toISOString()}\n`);

  const dates = getDatesBetween(START_DATE, END_DATE);
  console.log(`Total days to process: ${dates.length}\n`);

  const results = {
    totalDays: dates.length,
    successDays: 0,
    failedDays: 0,
    totalRecords: {
      vehicleUtilization: 0,
      driverUtilization: 0,
      idleEvents: 0,
      drivingPeriods: 0,
      geofences: 0
    },
    errors: []
  };

  const startTime = Date.now();

  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    const dayNum = i + 1;
    
    console.log(`\n[${ dayNum}/${dates.length}] Processing ${date}...`);
    
    try {
      const result = await syncMotiveOrgForDate(
        WOLVERINE_ORG_ID,
        MOTIVE_API_KEY,
        date,
        false // Not verification mode
      );

      if (result.success) {
        results.successDays++;
        
        // Aggregate counts
        result.results.forEach(r => {
          const endpoint = r.endpoint.replace('_', '');
          if (r.endpoint === 'vehicle_utilization') {
            results.totalRecords.vehicleUtilization += r.newCount + r.updatedCount;
          } else if (r.endpoint === 'driver_utilization') {
            results.totalRecords.driverUtilization += r.newCount + r.updatedCount;
          } else if (r.endpoint === 'idle_events') {
            results.totalRecords.idleEvents += r.newCount + r.updatedCount;
          } else if (r.endpoint === 'driving_periods') {
            results.totalRecords.drivingPeriods += r.newCount + r.updatedCount;
          } else if (r.endpoint === 'geofences') {
            results.totalRecords.geofences += r.newCount + r.updatedCount;
          }
        });

        console.log(`  ✅ Success in ${Math.round(result.duration / 1000)}s`);
      } else {
        results.failedDays++;
        results.errors.push({
          date,
          error: result.error || 'Unknown error'
        });
        console.log(`  ❌ Failed: ${result.error}`);
      }

      // Rate limiting: 3 seconds between days to avoid overwhelming the API
      if (i < dates.length - 1) {
        console.log(`  ⏳ Waiting 3 seconds before next day...`);
        await sleep(3000);
      }

    } catch (error) {
      results.failedDays++;
      results.errors.push({
        date,
        error: error.message
      });
      console.error(`  ❌ Exception: ${error.message}`);
      
      // Continue to next day even if this one failed
      if (i < dates.length - 1) {
        await sleep(3000);
      }
    }
  }

  const duration = Date.now() - startTime;
  const durationMinutes = Math.round(duration / 60000);

  console.log(`\n\n========================================`);
  console.log(`📊 BACKDATE COMPLETE - JANUARY 2026`);
  console.log(`========================================\n`);
  console.log(`Total Days Processed: ${results.totalDays}`);
  console.log(`Successful: ${results.successDays}`);
  console.log(`Failed: ${results.failedDays}`);
  console.log(`Duration: ${durationMinutes} minutes\n`);
  
  console.log(`📈 TOTAL RECORDS SYNCED:`);
  console.log(`  Vehicle Utilization: ${results.totalRecords.vehicleUtilization}`);
  console.log(`  Driver Utilization: ${results.totalRecords.driverUtilization}`);
  console.log(`  Idle Events: ${results.totalRecords.idleEvents}`);
  console.log(`  Driving Periods: ${results.totalRecords.drivingPeriods}`);
  console.log(`  Geofences: ${results.totalRecords.geofences}`);
  console.log(``);

  if (results.errors.length > 0) {
    console.log(`\n⚠️  ERRORS (${results.errors.length}):`);
    results.errors.forEach(e => {
      console.log(`  ${e.date}: ${e.error}`);
    });
    console.log('');
  }

  console.log(`Completed: ${new Date().toISOString()}\n`);
  
  if (results.failedDays > 0) {
    console.log(`⚠️  ${results.failedDays} days failed. You may want to re-run for those dates.`);
    process.exit(1);
  } else {
    console.log(`✅ All days processed successfully!`);
    process.exit(0);
  }
}

// Run the backdate
backdateJanuary2026().catch(error => {
  console.error('\n❌ FATAL ERROR:', error);
  process.exit(1);
});
