/**
 * MOTIVE SYNC SERVICE
 * Main orchestrator for syncing all Motive data
 */

import { appPrisma } from '../../lib/prisma.js';
import { syncVehicleUtilization } from './sync/syncVehicleUtilization.js';
import { syncDriverUtilization } from './sync/syncDriverUtilization.js';
import { syncIdleEvents } from './sync/syncIdleEvents.js';
import { syncDrivingPeriods } from './sync/syncDrivingPeriods.js';
import { syncGeofences } from './sync/syncGeofences.js';
import { getYesterday, getTwoDaysAgo, SyncResult } from './types.js';

interface OrgSyncResult {
  clerkOrgId: string;
  success: boolean;
  date: string;
  results: SyncResult[];
  error?: string;
  duration: number;
}

/**
 * Sync all Motive endpoints for a single organization and date
 */
export async function syncMotiveOrgForDate(
  clerkOrgId: string,
  apiKey: string,
  date: string,
  verify: boolean = false
): Promise<OrgSyncResult> {
  const startTime = Date.now();
  const orgResult: OrgSyncResult = {
    clerkOrgId,
    success: true,
    date,
    results: [],
    duration: 0
  };

  try {
    console.log(`\n📊 Syncing Motive data for ${clerkOrgId} on ${date} (verify: ${verify})`);

    // Sync all transactional endpoints
    const vehicleUtilResult = await syncVehicleUtilization(clerkOrgId, apiKey, date, verify);
    orgResult.results.push(vehicleUtilResult);
    console.log(`  ✓ Vehicle utilization: ${vehicleUtilResult.newCount} new, ${vehicleUtilResult.updatedCount} updated`);

    const driverUtilResult = await syncDriverUtilization(clerkOrgId, apiKey, date, verify);
    orgResult.results.push(driverUtilResult);
    console.log(`  ✓ Driver utilization: ${driverUtilResult.newCount} new, ${driverUtilResult.updatedCount} updated`);

    const idleEventsResult = await syncIdleEvents(clerkOrgId, apiKey, date, verify);
    orgResult.results.push(idleEventsResult);
    console.log(`  ✓ Idle events: ${idleEventsResult.newCount} new, ${idleEventsResult.updatedCount} updated`);

    const drivingPeriodsResult = await syncDrivingPeriods(clerkOrgId, apiKey, date, verify);
    orgResult.results.push(drivingPeriodsResult);
    console.log(`  ✓ Driving periods: ${drivingPeriodsResult.newCount} new, ${drivingPeriodsResult.updatedCount} updated`);

    // Sync geofences daily (no verification)
    const geofencesResult = await syncGeofences(clerkOrgId, apiKey);
    orgResult.results.push(geofencesResult);
    console.log(`  ✓ Geofences: ${geofencesResult.newCount} new, ${geofencesResult.updatedCount} updated`);

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
export async function syncMotiveDaily(): Promise<{
  totalOrgs: number;
  successCount: number;
  errorCount: number;
  results: OrgSyncResult[];
  duration: number;
}> {
  const startTime = Date.now();
  const yesterday = getYesterday();
  const twoDaysAgo = getTwoDaysAgo();

  console.log(`\n🚀 MOTIVE DAILY SYNC STARTED`);
  console.log(`  Primary sync date: ${yesterday}`);
  console.log(`  Verification date: ${twoDaysAgo}`);
  console.log(`  Timestamp: ${new Date().toISOString()}\n`);

  // Get all orgs with Motive configured
  const providerAccounts = await appPrisma.telematicsProviderAccount.findMany({
    where: {
      provider: 'MOTIVE',
      status: 'ACTIVE'
    }
  });

  console.log(`📋 Found ${providerAccounts.length} active Motive organizations\n`);

  const results: OrgSyncResult[] = [];
  let successCount = 0;
  let errorCount = 0;

  // Process each org
  for (const account of providerAccounts) {
    try {
      const apiKey = (account.credentialsJson as any).apiKey;

      // 1. Sync yesterday's data (primary)
      const yesterdayResult = await syncMotiveOrgForDate(
        account.clerkOrgId,
        apiKey,
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
      const verificationResult = await syncMotiveOrgForDate(
        account.clerkOrgId,
        apiKey,
        twoDaysAgo,
        true // Verification mode
      );
      results.push(verificationResult);

      // Update provider account
      await appPrisma.telematicsProviderAccount.update({
        where: { id: account.id },
        data: {
          lastSyncAt: new Date(),
          lastError: yesterdayResult.error || null
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

  console.log(`\n✅ MOTIVE DAILY SYNC COMPLETED`);
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
