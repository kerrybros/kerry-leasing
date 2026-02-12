/**
 * SAMSARA SYNC SERVICE
 * Main orchestrator for syncing all Samsara data
 */

import { appPrisma } from '../../lib/prisma.js';
import { syncFuelEnergyReports } from './sync/syncFuelEnergyReports.js';
import { getYesterday, getTwoDaysAgo, SyncResult } from './types.js';

/** Same shape as Motive for consistent logging and cron handling */
interface OrgSyncResult {
  clerkOrgId: string;
  success: boolean;
  date: string;
  results: SyncResult[];
  error?: string;
  duration: number;
}

/**
 * Sync all Samsara endpoints for a single organization and date
 */
export async function syncSamsaraOrgForDate(
  clerkOrgId: string,
  apiToken: string,
  date: string,
  verify: boolean = false
): Promise<OrgSyncResult> {
  const startTime = Date.now();
  const orgResult: OrgSyncResult = {
    clerkOrgId,
    success: true,
    date,
    results: [],
    duration: 0,
  };

  try {
    console.log(`\n📊 Syncing Samsara data for ${clerkOrgId} on ${date} (verify: ${verify})`);

    const fuelResult = await syncFuelEnergyReports(clerkOrgId, apiToken, date, verify);
    orgResult.results.push(fuelResult);
    console.log(
      `  ✓ Fuel-energy: ${fuelResult.newCount} new, ${fuelResult.updatedCount} updated, ` +
      `${fuelResult.errorCount} errors`
    );

    orgResult.success = fuelResult.errorCount === 0;
    orgResult.error = fuelResult.errors.length > 0
      ? fuelResult.errors.map(e => e.error).join('; ')
      : undefined;
    orgResult.duration = Date.now() - startTime;
    console.log(`✅ Completed sync for ${clerkOrgId} in ${Math.round(orgResult.duration / 1000)}s`);

    return orgResult;
  } catch (error: any) {
    orgResult.success = false;
    orgResult.error = error.message;
    orgResult.duration = Date.now() - startTime;
    console.error(`❌ Failed to sync ${clerkOrgId}:`, error.message);
    return orgResult;
  }
}

/**
 * Daily sync: Sync yesterday + verify 2 days ago for all orgs
 */
export async function syncSamsaraDaily(): Promise<{
  totalOrgs: number;
  successCount: number;
  errorCount: number;
  results: OrgSyncResult[];
  duration: number;
}> {
  const startTime = Date.now();
  const yesterday = getYesterday();
  const twoDaysAgo = getTwoDaysAgo();

  console.log(`\n🚀 SAMSARA DAILY SYNC STARTED`);
  console.log(`  Primary sync date: ${yesterday}`);
  console.log(`  Verification date: ${twoDaysAgo}`);
  console.log(`  Timestamp: ${new Date().toISOString()}\n`);

  // Get all orgs with Samsara configured
  const providerAccounts = await appPrisma.telematicsProviderAccount.findMany({
    where: {
      provider: 'SAMSARA',
      status: 'ACTIVE'
    }
  });

  console.log(`📋 Found ${providerAccounts.length} active Samsara organizations\n`);

  const results: OrgSyncResult[] = [];
  let successCount = 0;
  let errorCount = 0;

  // Process each org
  for (const account of providerAccounts) {
    try {
      const apiToken = (account.credentialsJson as any).apiToken;

      // 1. Sync yesterday's data (primary)
      const yesterdayResult = await syncSamsaraOrgForDate(
        account.clerkOrgId,
        apiToken,
        yesterday,
        false // Not verification
      );
      results.push(yesterdayResult);

      if (yesterdayResult.success) {
        successCount++;
      } else {
        errorCount++;
      }

      // 2. Verify 2 days ago (lookback)
      const verificationResult = await syncSamsaraOrgForDate(
        account.clerkOrgId,
        apiToken,
        twoDaysAgo,
        true // Verification mode
      );
      results.push(verificationResult);

      // Update provider account (same pattern as Motive)
      await appPrisma.telematicsProviderAccount.update({
        where: { id: account.id },
        data: {
          lastSyncAt: new Date(),
          lastError: yesterdayResult.error ?? null
        }
      });

      // Rate limiting: wait 2 seconds between orgs
      await sleep(2000);
    } catch (error: any) {
      errorCount++;
      console.error(`❌ Unexpected error for ${account.clerkOrgId}:`, error);

      // Update provider account with error
      await appPrisma.telematicsProviderAccount.update({
        where: { id: account.id },
        data: {
          lastError: error.message,
          status: 'ERROR'
        }
      });
    }
  }

  const duration = Date.now() - startTime;

  console.log(`\n✅ SAMSARA DAILY SYNC COMPLETED`);
  console.log(`  Total orgs: ${providerAccounts.length}`);
  console.log(`  Success: ${successCount}`);
  console.log(`  Errors: ${errorCount}`);
  console.log(`  Duration: ${Math.round(duration / 1000)}s\n`);

  return {
    totalOrgs: providerAccounts.length,
    successCount,
    errorCount,
    results,
    duration
  };
}

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
