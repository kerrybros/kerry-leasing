/**
 * DAILY CRON JOB FOR SAMSARA SYNC
 * Syncs yesterday (full EST day) + verifies 2 days ago for all active Samsara orgs.
 * Schedule: e.g. 6 AM EST daily (0 11 * * * in UTC, or use your scheduler).
 *
 * One-time backfill (e.g. Feb 1–11): pnpm backdate-samsara-feb -- --start=2026-02-01 --end=2026-02-11
 *
 * Usage:
 *   pnpm sync-samsara
 *   node dist/cron/sync-samsara-daily.js
 */

import { syncSamsaraDaily } from '../telematics/samsara/syncService.js';

async function main() {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`SAMSARA DAILY SYNC CRON JOB`);
  console.log(`Started at: ${new Date().toISOString()}`);
  console.log(`${'='.repeat(60)}\n`);

  try {
    // Validate environment
    if (!process.env.APP_DATABASE_URL) {
      throw new Error('APP_DATABASE_URL environment variable is required');
    }

    // Run daily sync
    const result = await syncSamsaraDaily();

    // Final status for monitoring / logs
    if (result.errorCount > 0) {
      console.log(`\n⚠️  CRON RESULT: ${result.successCount}/${result.totalOrgs} org(s) succeeded, ${result.errorCount} failed. Exit code 1.`);
      process.exit(1); // Non-zero exit for monitoring tools
    } else {
      console.log(`\n✅ CRON RESULT: All ${result.totalOrgs} org(s) synced successfully. Exit code 0.`);
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
