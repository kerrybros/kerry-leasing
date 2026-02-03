/**
 * Test sync for a single date
 */

import 'dotenv/config';
import { syncMotiveOrgForDate } from '../telematics/motive/syncService.js';

const WOLVERINE_ORG_ID = 'org_2slAi3SqvSCzvqCJE3i2YtWQCsO';
const MOTIVE_API_KEY = '11dca31e-79b0-4351-9684-9ae465a3b5ce';

async function testSync() {
  const testDate = '2026-02-02'; // Yesterday

  console.log(`\n=== Testing Motive Sync for ${testDate} ===\n`);

  try {
    const result = await syncMotiveOrgForDate(
      WOLVERINE_ORG_ID,
      MOTIVE_API_KEY,
      testDate,
      false // Not verification mode
    );

    console.log(`\n=== SYNC RESULTS ===`);
    console.log(`Success: ${result.success}`);
    console.log(`Duration: ${Math.round(result.duration / 1000)}s\n`);

    result.results.forEach(r => {
      console.log(`${r.endpoint}:`);
      console.log(`  Total: ${r.recordCount}`);
      console.log(`  New: ${r.newCount}`);
      console.log(`  Updated: ${r.updatedCount}`);
      console.log(`  Unchanged: ${r.unchangedCount}`);
      console.log(`  Errors: ${r.errorCount}`);
      if (r.errors.length > 0) {
        console.log(`  Error details:`, r.errors.slice(0, 3));
      }
      console.log('');
    });

    if (!result.success) {
      console.error('Error:', result.error);
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ Sync failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testSync();
