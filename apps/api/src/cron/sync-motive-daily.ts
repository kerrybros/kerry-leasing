/**
 * DAILY CRON JOB FOR MOTIVE SYNC
 * Runs daily at 6 AM EST to sync yesterday + verify 2 days ago
 * 
 * Usage:
 *   node dist/cron/sync-motive-daily.js
 *   OR
 *   tsx src/cron/sync-motive-daily.ts
 */

import { syncMotiveDaily } from '../telematics/motive/syncService';

async function main() {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`MOTIVE DAILY SYNC CRON JOB`);
  console.log(`Started at: ${new Date().toISOString()}`);
  console.log(`${'='.repeat(60)}\n`);

  try {
    // Validate environment
    if (!process.env.APP_DATABASE_URL) {
      throw new Error('APP_DATABASE_URL environment variable is required');
    }

    // Run daily sync
    const result = await syncMotiveDaily();

    // Exit with appropriate code
    if (result.errorCount > 0) {
      console.log(`\n⚠️  Completed with ${result.errorCount} errors`);
      process.exit(1); // Non-zero exit for monitoring tools
    } else {
      console.log(`\n✅ All syncs completed successfully`);
      process.exit(0);
    }
  } catch (error: any) {
    console.error(`\n❌ CRON JOB FAILED:`, error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run
main();
