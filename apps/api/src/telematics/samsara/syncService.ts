/**
 * SAMSARA SYNC SERVICE
 * Main orchestrator for syncing all Samsara data.
 *
 * Sync order per org per date:
 *   1. syncSamsaraVehicles (vehicle roster — gated to once per 7 days)
 *   2. syncFuelEnergyReports → writes to samsara_vehicle_utilization
 *   3. syncSamsaraVehicleStats → samsara_vehicle_stats_snapshots (primary pass only;
 *      API is point-in-time, not historical per verify date)
 *   4. syncSamsaraSafetyEvents → writes to samsara_safety_events
 *
 * Each step is isolated: a failure in one step does not prevent subsequent
 * steps from running. Auth errors (401) are treated as skips, not hard failures.
 *
 * Verify-pass window: 3 days (72h Samsara data lag).
 */

import { appPrisma } from '../../lib/prisma.js';
import { syncFuelEnergyReports } from './sync/syncFuelEnergyReports.js';
import { syncSamsaraVehicles } from './sync/syncSamsaraVehicles.js';
import { syncSamsaraVehicleStats } from './sync/syncSamsaraVehicleStats.js';
import { syncSamsaraSafetyEvents } from './sync/syncSamsaraSafetyEvents.js';
import { syncSamsaraAddresses } from './sync/syncSamsaraAddresses.js';
import { syncSamsaraDrivers } from './sync/syncSamsaraDrivers.js';
import { syncSamsaraDriverFuelEnergy } from './sync/syncSamsaraDriverFuelEnergy.js';
import { syncSamsaraDriverSafetyScores } from './sync/syncSamsaraDriverSafetyScores.js';
import { getYesterday, getTwoDaysAgo, SyncResult } from './types.js';
import { getThreeDaysAgo } from '../dates.js';
import { readCredentials } from '../../lib/credentials.js';
import { TelematicsAuthError } from '../errors.js';

// In-memory gate: track last vehicle roster sync time per org (7-day interval)
const vehicleRosterLastSyncAt = new Map<string, number>();
const VEHICLE_ROSTER_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

// Addresses (geofences) + drivers are configuration data — sync once per day on
// the primary pass. Tracked per-sync so a partial failure (e.g. drivers 401s
// while addresses succeeds) doesn't force both to re-run the next cron tick.
const addressesLastSyncDate = new Map<string, string>();
const driversLastSyncDate = new Map<string, string>();

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
          `Skipped: Samsara returned 401 for ${err.path}. ` +
          `The API token may lack the required scope for this endpoint. ` +
          `Other endpoints sharing the same token are unaffected.`,
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
 * Sync all Samsara endpoints for a single organization and date.
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
    verify,
    results: [],
    duration: 0,
  };

  console.log(`\n[Samsara] Syncing org ${clerkOrgId} on ${date} (verify: ${verify})`);

  // 1. Vehicle roster (gated to once per 7 days)
  const lastRosterSync = vehicleRosterLastSyncAt.get(clerkOrgId) ?? 0;
  if (Date.now() - lastRosterSync > VEHICLE_ROSTER_INTERVAL_MS) {
    const rosterResult = await safeStep('vehicles_roster', date, () =>
      syncSamsaraVehicles(clerkOrgId, apiToken)
    );
    orgResult.results.push(rosterResult);
    const rosterSucceeded = !rosterResult.skipped && rosterResult.errorCount === 0;
    if (rosterSucceeded) {
      vehicleRosterLastSyncAt.set(clerkOrgId, Date.now());
    }
    console.log(
      rosterResult.skipped
        ? `  ⏭  Vehicle roster: skipped (${rosterResult.skipReason})`
        : `  ✓ Vehicle roster: ${rosterResult.recordCount} vehicles, ${rosterResult.errorCount} errors`
    );
  } else {
    console.log(`  ⏭  Vehicle roster: skipped (synced within 7 days)`);
  }

  // 2. Fuel-energy reports → samsara_vehicle_utilization
  const fuelResult = await safeStep('fuel_energy', date, () =>
    syncFuelEnergyReports(clerkOrgId, apiToken, date, verify)
  );
  orgResult.results.push(fuelResult);
  console.log(
    fuelResult.skipped
      ? `  ⏭  Fuel-energy: skipped (${fuelResult.skipReason})`
      : `  ✓ Fuel-energy: ${fuelResult.newCount} new, ${fuelResult.unchangedCount} unchanged, ` +
        `${fuelResult.updatedCount} updated` +
        (fuelResult.errorCount > 0 ? `, ${fuelResult.errorCount} errors` : '')
  );

  // 3. Vehicle stats snapshot (live /fleet/vehicles/stats — not scoped to sync `date`).
  // On verify passes, skipping avoids re-fetching with fresh timestamps and redundant rows.
  let statsResult: SyncResult;
  if (verify) {
    statsResult = {
      endpoint: 'vehicle_stats',
      date,
      recordCount: 0,
      newCount: 0,
      updatedCount: 0,
      unchangedCount: 0,
      errorCount: 0,
      errors: [],
      skipped: true,
      skipReason:
        'Point-in-time fleet stats run on the primary sync only (not tied to verify dates).',
    };
    orgResult.results.push(statsResult);
    console.log(`  ⏭  Vehicle stats: skipped (verify pass — primary sync only)`);
  } else {
    statsResult = await safeStep('vehicle_stats', date, () =>
      syncSamsaraVehicleStats(clerkOrgId, apiToken)
    );
    orgResult.results.push(statsResult);
    console.log(
      statsResult.skipped
        ? `  ⏭  Vehicle stats: skipped (${statsResult.skipReason})`
        : `  ✓ Vehicle stats: ${statsResult.recordCount} vehicles — ${statsResult.newCount} inserted, ${statsResult.unchangedCount} unchanged, ` +
            `${statsResult.updatedCount} updated, ${statsResult.errorCount} errors`
    );
  }


  // 4. Addresses + drivers (config data — once per day, primary pass only).
  // Drives geofence layer and operator → driver-name resolution on the IDLE map.
  // Tracked per-sync so a partial failure doesn't drag both into re-runs.
  if (verify) {
    console.log(`  ⏭  Addresses + drivers: skipped (verify pass — primary sync only)`);
  } else {
    if (addressesLastSyncDate.get(clerkOrgId) !== date) {
      const addressesResult = await safeStep('addresses', date, () =>
        syncSamsaraAddresses(clerkOrgId, apiToken)
      );
      orgResult.results.push(addressesResult);
      console.log(
        addressesResult.skipped
          ? `  ⏭  Addresses: skipped (${addressesResult.skipReason})`
          : `  ✓ Addresses: ${addressesResult.newCount} new, ${addressesResult.updatedCount} updated, ${addressesResult.errorCount} errors`
      );
      // Set the gate even on auth-skips (401 → errorCount=0, skipped=true): retrying
      // a missing-scope token every cron tick just burns API calls and doesn't help.
      if (addressesResult.errorCount === 0) {
        addressesLastSyncDate.set(clerkOrgId, date);
      }
    } else {
      console.log(`  ⏭  Addresses: skipped (already synced today)`);
    }

    if (driversLastSyncDate.get(clerkOrgId) !== date) {
      const driversResult = await safeStep('drivers', date, () =>
        syncSamsaraDrivers(clerkOrgId, apiToken)
      );
      orgResult.results.push(driversResult);
      console.log(
        driversResult.skipped
          ? `  ⏭  Drivers: skipped (${driversResult.skipReason})`
          : `  ✓ Drivers: ${driversResult.newCount} new, ${driversResult.updatedCount} updated, ${driversResult.errorCount} errors`
      );
      if (driversResult.errorCount === 0) {
        driversLastSyncDate.set(clerkOrgId, date);
      }
    } else {
      console.log(`  ⏭  Drivers: skipped (already synced today)`);
    }
  }

  // 5. Driver fuel-energy (per-driver-per-day) → samsara_driver_fuel_energy
  const driverFuelResult = await safeStep('driver_fuel_energy', date, () =>
    syncSamsaraDriverFuelEnergy(clerkOrgId, apiToken, date, verify)
  );
  orgResult.results.push(driverFuelResult);
  console.log(
    driverFuelResult.skipped
      ? `  ⏭  Driver fuel-energy: skipped (${driverFuelResult.skipReason})`
      : `  ✓ Driver fuel-energy: ${driverFuelResult.newCount} new, ${driverFuelResult.unchangedCount} unchanged, ` +
        `${driverFuelResult.updatedCount} updated` +
        (driverFuelResult.errorCount > 0 ? `, ${driverFuelResult.errorCount} errors` : '')
  );

  // 6. Driver safety scores (per-driver-per-day) → samsara_driver_efficiency
  const driverSafetyResult = await safeStep('driver_safety_scores', date, () =>
    syncSamsaraDriverSafetyScores(clerkOrgId, apiToken, date, verify)
  );
  orgResult.results.push(driverSafetyResult);
  console.log(
    driverSafetyResult.skipped
      ? `  ⏭  Driver safety-scores: skipped (${driverSafetyResult.skipReason})`
      : `  ✓ Driver safety-scores: ${driverSafetyResult.newCount} new, ${driverSafetyResult.unchangedCount} unchanged, ` +
        `${driverSafetyResult.updatedCount} updated` +
        (driverSafetyResult.errorCount > 0 ? `, ${driverSafetyResult.errorCount} errors` : '')
  );

  // 7. Safety events
  const safetyResult = await safeStep('safety_events', date, () =>
    syncSamsaraSafetyEvents(clerkOrgId, apiToken, date)
  );
  orgResult.results.push(safetyResult);
  console.log(
    safetyResult.skipped
      ? `  ⏭  Safety events: skipped (${safetyResult.skipReason})`
      : `  ✓ Safety events: ${safetyResult.newCount} new, ${safetyResult.unchangedCount} existing, ` +
        `${safetyResult.errorCount} errors`
  );

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
      ? `  ✅ Completed sync for ${clerkOrgId} in ${Math.round(orgResult.duration / 1000)}s`
      : `  ❌ Sync finished with errors for ${clerkOrgId} in ${Math.round(orgResult.duration / 1000)}s`
  );

  return orgResult;
}

/**
 * Daily sync: yesterday (primary) + 2 days ago + 3 days ago (verify passes).
 * Samsara has up to 72h data lag so we re-sync the last 3 days every run.
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
  const threeDaysAgo = getThreeDaysAgo();

  console.log(`\n🚀 SAMSARA DAILY SYNC STARTED`);
  console.log(`  Primary sync date: ${yesterday}`);
  console.log(`  Verify dates: ${twoDaysAgo}, ${threeDaysAgo}`);
  console.log(`  Timestamp: ${new Date().toISOString()}\n`);

  const providerAccounts = await appPrisma.telematicsProviderAccount.findMany({
    where: { provider: 'SAMSARA', status: 'ACTIVE' },
  });

  console.log(`📋 Found ${providerAccounts.length} active Samsara organizations\n`);

  const results: OrgSyncResult[] = [];
  let successCount = 0;
  let errorCount = 0;

  for (const account of providerAccounts) {
    try {
      const apiToken = readCredentials(account.credentialsJson).apiToken as string;

      // Primary sync: yesterday
      const primaryResult = await syncSamsaraOrgForDate(account.clerkOrgId, apiToken, yesterday, false);
      results.push(primaryResult);
      if (primaryResult.success) successCount++; else errorCount++;

      // Verify pass: 2 days ago
      const verify2 = await syncSamsaraOrgForDate(account.clerkOrgId, apiToken, twoDaysAgo, true);
      results.push(verify2);

      // Verify pass: 3 days ago
      const verify3 = await syncSamsaraOrgForDate(account.clerkOrgId, apiToken, threeDaysAgo, true);
      results.push(verify3);

      await appPrisma.telematicsProviderAccount.update({
        where: { id: account.id },
        data: {
          status: 'ACTIVE',
          lastSyncAt: new Date(),
          lastError: primaryResult.error ?? null,
        },
      });

      await sleep(2000);
    } catch (error: any) {
      errorCount++;
      console.error(`❌ Unexpected error for ${account.clerkOrgId}:`, error);
      await appPrisma.telematicsProviderAccount.update({
        where: { id: account.id },
        data: { lastError: error.message, status: 'ERROR' },
      });
    }
  }

  const duration = Date.now() - startTime;

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`✅ SAMSARA DAILY SYNC COMPLETED`);
  console.log(`  Orgs: ${providerAccounts.length} total, ${successCount} succeeded, ${errorCount} failed`);
  console.log(`  Duration: ${Math.round(duration / 1000)}s`);
  console.log(`${'─'.repeat(50)}\n`);

  return { totalOrgs: providerAccounts.length, successCount, errorCount, results, duration };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
