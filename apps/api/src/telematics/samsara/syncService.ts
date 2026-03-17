/**
 * SAMSARA SYNC SERVICE
 * Main orchestrator for syncing all Samsara data
 */

import { appPrisma } from '../../lib/prisma.js';
import { syncFuelEnergyReports } from './sync/syncFuelEnergyReports.js';
import { getYesterday, getTwoDaysAgo, SyncResult } from './types.js';
import { readCredentials } from '../../lib/credentials.js';

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
      `  ✓ Fuel-energy: ${fuelResult.newCount} new records added, ${fuelResult.unchangedCount} preexisting records unchanged, ${fuelResult.updatedCount} updated (overwritten)` +
      (fuelResult.errorCount > 0 ? `, ${fuelResult.errorCount} errors` : '')
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
      const apiToken = readCredentials(account.credentialsJson).apiToken as string;

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

      const yesterdayFuel = yesterdayResult.results[0];
      const yesterdaySummary =
        yesterdayFuel?.recordCount != null
          ? `${yesterdayFuel.newCount} new records added, ${yesterdayFuel.unchangedCount} preexisting records unchanged, ${yesterdayFuel.updatedCount} updated (overwritten)`
          : 'no data';
      console.log(`  📅 Yesterday (${yesterday}): ${yesterdaySummary}`);
      if ((yesterdayFuel?.errorCount ?? 0) > 0) {
        console.log(`     ⚠️  ${yesterdayFuel!.errorCount} error(s): ${yesterdayFuel!.errors.map((e) => e.error).join('; ')}`);
      }

      // 2. Verify 2 days ago (lookback)
      const verificationResult = await syncSamsaraOrgForDate(
        account.clerkOrgId,
        apiToken,
        twoDaysAgo,
        true // Verification mode
      );
      results.push(verificationResult);

      const verifyFuel = verificationResult.results[0];
      const verifySummary =
        verifyFuel?.recordCount != null
          ? `${verifyFuel.newCount} new records added, ${verifyFuel.unchangedCount} preexisting records unchanged, ${verifyFuel.updatedCount} updated (overwritten)`
          : 'no data';
      console.log(`  🔍 Verification (${twoDaysAgo}): ${verifySummary}`);

      // Update provider account — reset to ACTIVE on success (matches Motive recovery behavior)
      await appPrisma.telematicsProviderAccount.update({
        where: { id: account.id },
        data: {
          status: 'ACTIVE',
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

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`✅ SAMSARA DAILY SYNC COMPLETED`);
  console.log(`  Dates checked: yesterday (${yesterday}), verification (${twoDaysAgo})`);
  console.log(`  Orgs: ${providerAccounts.length} total, ${successCount} succeeded, ${errorCount} failed`);
  console.log(`  Duration: ${Math.round(duration / 1000)}s`);
  if (errorCount > 0) {
    const failed = results.filter((r) => !r.success && r.error);
    failed.forEach((r) => console.log(`  ❌ ${r.clerkOrgId}: ${r.error}`));
  }
  console.log(`${'─'.repeat(50)}\n`);

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
