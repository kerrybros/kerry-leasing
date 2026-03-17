/**
 * HISTORICAL BACKDATE SCRIPT FOR MOTIVE DATA
 * Pulls historical data for a specified date range
 * 
 * Usage:
 *   npm run backdate -- --org=org_xxxxx --start=2025-05-01 --end=2026-02-02
 */

import { fileURLToPath } from 'url';
import { appPrisma } from '../../lib/prisma.js';
import { syncMotiveOrgForDate } from './syncService.js';
import { getDateRange } from './types.js';
import { readCredentials } from '../../lib/credentials.js';

interface BackdateOptions {
  clerkOrgId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
}

async function backdateMotiveData(options: BackdateOptions): Promise<void> {
  const { clerkOrgId, startDate, endDate } = options;

  console.log(`\n🔄 MOTIVE HISTORICAL BACKDATE`);
  console.log(`  Organization: ${clerkOrgId}`);
  console.log(`  Date range: ${startDate} to ${endDate}`);
  console.log(`  Timestamp: ${new Date().toISOString()}\n`);

  // Get org's Motive credentials
  const providerAccount = await appPrisma.telematicsProviderAccount.findUnique({
    where: {
      clerkOrgId,
      provider: 'MOTIVE'
    }
  });

  if (!providerAccount) {
    throw new Error(`No Motive provider account found for ${clerkOrgId}`);
  }

  if (providerAccount.status !== 'ACTIVE') {
    throw new Error(`Motive provider account for ${clerkOrgId} is not active (status: ${providerAccount.status})`);
  }

  const apiKey = readCredentials(providerAccount.credentialsJson).apiKey as string;

  if (!apiKey) {
    throw new Error(`No API key found in credentials for ${clerkOrgId}`);
  }

  // Calculate all dates in range
  const dates = getDateRange(startDate, endDate);
  console.log(`📅 Total days to process: ${dates.length}\n`);

  let successCount = 0;
  let errorCount = 0;
  const errors: Array<{ date: string; error: string }> = [];

  // Process each date sequentially
  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    const progress = `[${i + 1}/${dates.length}]`;

    try {
      console.log(`${progress} Processing ${date}...`);

      // Sync all endpoints for this date (NO verification - initial load)
      const result = await syncMotiveOrgForDate(clerkOrgId, apiKey, date, false);

      if (result.success) {
        const totalRecords = result.results.reduce((sum, r) => sum + r.recordCount, 0);
        console.log(`  ✓ ${date} complete - ${totalRecords} total records in ${Math.round(result.duration / 1000)}s`);
        successCount++;
      } else {
        console.log(`  ✗ ${date} failed: ${result.error}`);
        errorCount++;
        errors.push({ date, error: result.error || 'Unknown error' });
      }

      // Rate limiting: 2 seconds between days
      await sleep(2000);
    } catch (error: any) {
      console.error(`  ✗ ${date} failed:`, error.message);
      errorCount++;
      errors.push({ date, error: error.message });

      // Continue to next date despite error
    }
  }

  console.log(`\n✅ BACKDATE COMPLETE`);
  console.log(`  Total days: ${dates.length}`);
  console.log(`  Success: ${successCount}`);
  console.log(`  Errors: ${errorCount}`);

  if (errors.length > 0) {
    console.log(`\n❌ Failed dates:`);
    errors.forEach(({ date, error }) => {
      console.log(`  - ${date}: ${error}`);
    });
  }

  // Update provider account
  await appPrisma.telematicsProviderAccount.update({
    where: { id: providerAccount.id },
    data: {
      lastSyncAt: new Date(),
      lastError: errors.length > 0 ? `Backdate completed with ${errors.length} errors` : null
    }
  });

  console.log(`\n✅ Backdate finished at ${new Date().toISOString()}\n`);
}

/**
 * Parse CLI arguments
 */
function parseArgs(): BackdateOptions {
  const args = process.argv.slice(2);
  const options: Partial<BackdateOptions> = {};

  for (const arg of args) {
    if (arg.startsWith('--org=')) {
      options.clerkOrgId = arg.split('=')[1];
    } else if (arg.startsWith('--start=')) {
      options.startDate = arg.split('=')[1];
    } else if (arg.startsWith('--end=')) {
      options.endDate = arg.split('=')[1];
    }
  }

  // Validate required args
  if (!options.clerkOrgId) {
    throw new Error('Missing required argument: --org=org_xxxxx');
  }
  if (!options.startDate) {
    throw new Error('Missing required argument: --start=YYYY-MM-DD');
  }
  if (!options.endDate) {
    throw new Error('Missing required argument: --end=YYYY-MM-DD');
  }

  // Validate date format
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(options.startDate) || !dateRegex.test(options.endDate)) {
    throw new Error('Dates must be in YYYY-MM-DD format');
  }

  return options as BackdateOptions;
}

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Main entry point
 */
async function main() {
  try {
    const options = parseArgs();
    await backdateMotiveData(options);
    process.exit(0);
  } catch (error: any) {
    console.error(`\n❌ BACKDATE FAILED:`, error.message);
    process.exit(1);
  }
}

// Run if executed directly
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main();
}

export { backdateMotiveData };

