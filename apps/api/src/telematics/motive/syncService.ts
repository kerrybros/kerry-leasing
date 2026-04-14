/**
 * MOTIVE SYNC SERVICE
 * Main orchestrator for syncing all Motive data.
 *
 * Each step is isolated: a failure in one step does not prevent subsequent
 * steps from running. Auth errors (401) are treated as skips, not hard failures.
 */

import { appPrisma } from '../../lib/prisma.js';
import { syncVehicleUtilization } from './sync/syncVehicleUtilization.js';
import { syncDriverUtilization } from './sync/syncDriverUtilization.js';
import { syncIdleEvents } from './sync/syncIdleEvents.js';
import { syncDrivingPeriods } from './sync/syncDrivingPeriods.js';
import { syncGeofences } from './sync/syncGeofences.js';
import { syncMotiveScorecard } from './sync/syncMotiveScorecard.js';
import { reconcileMotiveVehicleFromDrivingPeriods } from './sync/reconcileMotiveVehicleFromDrivingPeriods.js';
import { getYesterday, getTwoDaysAgo, SyncResult } from './types.js';
import { readCredentials } from '../../lib/credentials.js';
import { TelematicsAuthError } from '../errors.js';

// Track last geofence sync time per org in memory.
// Geofences are static config data — syncing once per 24h is sufficient.
const geofenceLastSyncAt = new Map<string, number>();
const GEOFENCE_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface OrgSyncResult {
  clerkOrgId: string;
  success: boolean;
  date: string;
  verify: boolean;
  results: SyncResult[];
  error?: string;
  duration: number;
}

/**
 * Run a single sync step with isolation. If the step throws:
 *  - TelematicsAuthError → mark as skipped (not a hard failure)
 *  - Anything else       → mark as error
 * Either way, subsequent steps will still run.
 */
async function safeStep(
  stepName: string,
  date: string,
  fn: () => Promise<SyncResult>
): Promise<SyncResult> {
  try {
    return await fn();
  } catch (err: any) {
    if (err instanceof TelematicsAuthError) {
      return {
        endpoint: stepName,
        date,
        recordCount: 0,
        newCount: 0,
        updatedCount: 0,
        unchangedCount: 0,
        errorCount: 0,
        errors: [],
        skipped: true,
        skipReason:
          `Skipped: Motive returned 401 for ${err.path}. ` +
          `The API key may lack the required scope for this endpoint.`,
      };
    }
    return {
      endpoint: stepName,
      date,
      recordCount: 0,
      newCount: 0,
      updatedCount: 0,
      unchangedCount: 0,
      errorCount: 1,
      errors: [{ recordId: stepName, error: err.message ?? String(err) }],
    };
  }
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
    verify,
    results: [],
    duration: 0
  };

  console.log(`\n📊 Syncing Motive data for ${clerkOrgId} on ${date} (verify: ${verify})`);

  // 1. Vehicle utilization
  const vehicleUtilResult = await safeStep('vehicle_utilization', date, () =>
    syncVehicleUtilization(clerkOrgId, apiKey, date, verify)
  );
  orgResult.results.push(vehicleUtilResult);
  console.log(
    vehicleUtilResult.skipped
      ? `  ⏭  Vehicle utilization: skipped (${vehicleUtilResult.skipReason})`
      : `  ✓ Vehicle utilization: ${vehicleUtilResult.newCount} new, ${vehicleUtilResult.unchangedCount} unchanged, ${vehicleUtilResult.updatedCount} updated`
  );

  // 2. Driver utilization
  const driverUtilResult = await safeStep('driver_utilization', date, () =>
    syncDriverUtilization(clerkOrgId, apiKey, date, verify)
  );
  orgResult.results.push(driverUtilResult);
  console.log(
    driverUtilResult.skipped
      ? `  ⏭  Driver utilization: skipped (${driverUtilResult.skipReason})`
      : `  ✓ Driver utilization: ${driverUtilResult.newCount} new, ${driverUtilResult.unchangedCount} unchanged, ${driverUtilResult.updatedCount} updated`
  );

  // 3. Idle events
  const idleEventsResult = await safeStep('idle_events', date, () =>
    syncIdleEvents(clerkOrgId, apiKey, date, verify)
  );
  orgResult.results.push(idleEventsResult);
  console.log(
    idleEventsResult.skipped
      ? `  ⏭  Idle events: skipped (${idleEventsResult.skipReason})`
      : `  ✓ Idle events: ${idleEventsResult.newCount} new, ${idleEventsResult.unchangedCount} unchanged, ${idleEventsResult.updatedCount} updated`
  );

  // 4. Driving periods
  const drivingPeriodsResult = await safeStep('driving_periods', date, () =>
    syncDrivingPeriods(clerkOrgId, apiKey, date, verify)
  );
  orgResult.results.push(drivingPeriodsResult);
  console.log(
    drivingPeriodsResult.skipped
      ? `  ⏭  Driving periods: skipped (${drivingPeriodsResult.skipReason})`
      : `  ✓ Driving periods: ${drivingPeriodsResult.newCount} new, ${drivingPeriodsResult.unchangedCount} unchanged, ${drivingPeriodsResult.updatedCount} updated`
  );

  // 5. Reconcile vehicle utilization from driving periods
  try {
    const reconcileResult = await reconcileMotiveVehicleFromDrivingPeriods(clerkOrgId, date);
    if (reconcileResult.reconciled > 0) {
      for (const p of reconcileResult.patches) {
        console.log(`  ⚡ Reconciled vehicle ${p.vehicleNumber ?? p.vehicleId} ${p.field}: ${p.before.toFixed(1)} → ${p.after.toFixed(1)} (${p.pctDiff})`);
      }
    }
  } catch (err: any) {
    console.warn(`  ⚠️  Reconciliation failed (non-fatal): ${err.message}`);
  }

  // 6. Scorecard
  const scorecardResult = await safeStep('scorecard', date, () =>
    syncMotiveScorecard(clerkOrgId, apiKey, date, verify)
  );
  orgResult.results.push(scorecardResult);
  console.log(
    scorecardResult.skipped
      ? `  ⏭  Scorecard: skipped (${scorecardResult.skipReason})`
      : `  ✓ Scorecard: ${scorecardResult.newCount} new, ${scorecardResult.unchangedCount} unchanged, ${scorecardResult.updatedCount} updated`
  );

  // 7. Geofences (at most once per 24h)
  const lastGeofenceSync = geofenceLastSyncAt.get(clerkOrgId) ?? 0;
  const geofenceStale = Date.now() - lastGeofenceSync > GEOFENCE_SYNC_INTERVAL_MS;
  if (geofenceStale) {
    const geofencesResult = await safeStep('geofences', date, () =>
      syncGeofences(clerkOrgId, apiKey)
    );
    orgResult.results.push(geofencesResult);
    geofenceLastSyncAt.set(clerkOrgId, Date.now());
    console.log(
      geofencesResult.skipped
        ? `  ⏭  Geofences: skipped (${geofencesResult.skipReason})`
        : `  ✓ Geofences: ${geofencesResult.newCount} new, ${geofencesResult.unchangedCount} unchanged, ${geofencesResult.updatedCount} updated`
    );
  } else {
    console.log(`  ⏭  Geofences: skipped (synced within 24h)`);
  }

  // Determine success: only count non-skipped errors
  const totalErrors = orgResult.results.reduce(
    (s, r) => s + (r.skipped ? 0 : r.errorCount),
    0
  );
  orgResult.success = totalErrors === 0;
  orgResult.error =
    orgResult.results
      .filter((r) => !r.skipped && r.errors.length > 0)
      .flatMap((r) => r.errors)
      .map((e) => e.error)
      .join('; ') || undefined;
  orgResult.duration = Date.now() - startTime;

  console.log(
    orgResult.success
      ? `✅ Completed sync for ${clerkOrgId} in ${Math.round(orgResult.duration / 1000)}s`
      : `❌ Sync finished with errors for ${clerkOrgId} in ${Math.round(orgResult.duration / 1000)}s`
  );

  return orgResult;
}

/**
 * Daily sync: Sync yesterday + verify 2 days ago for all orgs.
 * Does NOT backfill historical dates. For full-term driver miles/MPG (driving periods),
 * run the backdate script: pnpm backdate -- --org=<clerkOrgId> --start=YYYY-MM-DD --end=YYYY-MM-DD
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
      const apiKey = readCredentials(account.credentialsJson).apiKey as string;

      // 1. Sync yesterday's data (primary)
      const yesterdayResult = await syncMotiveOrgForDate(
        account.clerkOrgId,
        apiKey,
        yesterday,
        false
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
        true
      );
      results.push(verificationResult);

      // Update provider account (clear error and restore ACTIVE so org recovers after transient failures)
      await appPrisma.telematicsProviderAccount.update({
        where: { id: account.id },
        data: {
          lastSyncAt: new Date(),
          lastError: yesterdayResult.error || null,
          status: 'ACTIVE'
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

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
