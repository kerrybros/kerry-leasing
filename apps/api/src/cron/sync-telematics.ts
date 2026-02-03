/**
 * TELEMATICS SYNC CRON JOB
 * 
 * Entrypoint for scheduled telematics sync
 * Run this as a Render Cron Job, NOT in the web service
 * 
 * Usage:
 *   node dist/cron/sync-telematics.js
 * 
 * Environment:
 *   - Requires all API env vars (APP_DATABASE_URL, CLERK_SECRET_KEY, etc.)
 *   - Runs sync for "yesterday" in America/Toronto timezone
 * 
 * Exit codes:
 *   0 - Success (all orgs synced)
 *   1 - Partial failure (some orgs failed)
 *   2 - Fatal error (couldn't run sync at all)
 */

import { config } from '../config.js';
import { syncAllOrgsForDate, getYesterdayToronto } from '../telematics/syncTelematics.js';
import { disconnectAppDb } from '../db/appRepo.js';

async function main() {
  try {
    console.log('='.repeat(60));
    console.log('TELEMATICS SYNC CRON JOB');
    console.log('='.repeat(60));
    console.log(`Environment: ${config.nodeEnv}`);
    console.log(`Started at: ${new Date().toISOString()}`);
    console.log('');

    // Validate environment
    if (!config.appDatabaseUrl) {
      console.error('❌ APP_DATABASE_URL not configured');
      process.exit(2);
    }

    if (!config.clerk.secretKey) {
      console.error('❌ CLERK_SECRET_KEY not configured');
      process.exit(2);
    }

    // Get date to sync (yesterday Toronto)
    const date = getYesterdayToronto();
    console.log(`Syncing date: ${date} (yesterday in America/Toronto)`);
    console.log('');

    // Run sync
    const results = await syncAllOrgsForDate(date);

    // Determine exit code
    const allSuccess = results.every(r => r.success);
    const anySuccess = results.some(r => r.success);

    console.log('');
    console.log('='.repeat(60));
    
    if (allSuccess) {
      console.log('✅ All organizations synced successfully');
      console.log('='.repeat(60));
      await cleanup();
      process.exit(0);
    } else if (anySuccess) {
      console.log('⚠️  Partial success - some organizations failed');
      console.log('='.repeat(60));
      
      // Log failed orgs
      const failed = results.filter(r => !r.success);
      console.log('\nFailed organizations:');
      failed.forEach(r => {
        console.log(`  - ${r.clerkOrgId}: ${r.error}`);
      });
      
      await cleanup();
      process.exit(1);
    } else {
      console.log('❌ All organizations failed to sync');
      console.log('='.repeat(60));
      await cleanup();
      process.exit(1);
    }

  } catch (error) {
    console.error('');
    console.error('='.repeat(60));
    console.error('💥 FATAL ERROR');
    console.error('='.repeat(60));
    console.error(error);
    await cleanup();
    process.exit(2);
  }
}

async function cleanup() {
  try {
    await disconnectAppDb();
  } catch (error) {
    console.error('Error during cleanup:', error);
  }
}

// Handle uncaught errors
process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
  cleanup().then(() => process.exit(2));
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  cleanup().then(() => process.exit(2));
});

// Run main
main();
