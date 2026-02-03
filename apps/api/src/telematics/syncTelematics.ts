/**
 * TELEMATICS SYNC SERVICE
 * 
 * Syncs telematics data from configured providers into APP database
 * Handles VIN mapping and normalization
 * 
 * Date handling: Uses America/Toronto timezone for "yesterday"
 */

import { getAppClient } from '../db/appRepo.js';
import { createProvider } from './providers/index.js';
import { TelematicsProvider, TelematicsProviderStatus, type SyncResult } from './types.js';

/**
 * Get yesterday's date in YYYY-MM-DD format (America/Toronto timezone)
 */
export function getYesterdayToronto(): string {
  const now = new Date();
  // Get Toronto time (EST/EDT)
  const torontoTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Toronto' }));
  torontoTime.setDate(torontoTime.getDate() - 1);
  
  const year = torontoTime.getFullYear();
  const month = String(torontoTime.getMonth() + 1).padStart(2, '0');
  const day = String(torontoTime.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

/**
 * Sync telematics data for a single organization for a specific date
 * 
 * @param clerkOrgId - Clerk organization ID
 * @param date - Date in YYYY-MM-DD format
 * @returns Sync result
 */
export async function syncOrgForDate(clerkOrgId: string, date: string): Promise<SyncResult> {
  const appClient = getAppClient();
  
  const result: SyncResult = {
    clerkOrgId,
    provider: TelematicsProvider.SAMSARA, // Will be updated
    date,
    success: false,
    metricsCount: 0,
  };

  try {
    // Load provider account
    const account = await appClient.telematicsProviderAccount.findUnique({
      where: { clerkOrgId },
    });

    if (!account) {
      throw new Error('No telematics provider configured for this organization');
    }

    if (account.status !== TelematicsProviderStatus.ACTIVE) {
      throw new Error(`Provider account status is ${account.status}, not syncing`);
    }

    result.provider = account.provider as TelematicsProvider;

    // Create provider adapter
    const provider = createProvider(
      account.provider as TelematicsProvider,
      account.credentialsJson as any
    );

    // Fetch daily metrics from provider (includes raw data)
    const rawMetrics = await provider.fetchDailyMetricsForDate(date);

    // Load VIN mappings for this org (for vehicles without VIN from provider)
    const vinMappings = await appClient.telematicsVehicleMap.findMany({
      where: {
        clerkOrgId,
        provider: account.provider,
      },
    });

    const vinMapByProviderId = new Map(
      vinMappings.map(m => [m.providerVehicleId, m.vin])
    );

    // Process each raw metric
    for (const rawMetric of rawMetrics) {
      const { providerVehicleId, rawResponse, normalized } = rawMetric;

      // Apply VIN mapping if needed
      const finalVin = normalized.vin || vinMapByProviderId.get(providerVehicleId);
      
      if (!finalVin) {
        console.warn(`No VIN available for vehicle ${providerVehicleId}, skipping`);
        continue;
      }

      // 1. Store raw data in provider-specific table
      let samsaraRawDataId: string | null = null;
      let motiveRawDataId: string | null = null;

      if (account.provider === TelematicsProvider.SAMSARA) {
        const samsaraData = rawResponse as any;
        const samsaraRecord = await appClient.samsaraRawData.upsert({
          where: {
            clerkOrgId_vehicleId_date: {
              clerkOrgId,
              vehicleId: providerVehicleId,
              date,
            },
          },
          create: {
            clerkOrgId,
            vehicleId: samsaraData.vehicleId,
            vin: samsaraData.vin,
            vehicleName: samsaraData.vehicleName,
            date,
            startTime: samsaraData.startTime,
            endTime: samsaraData.endTime,
            odometerStart: samsaraData.odometerStart,
            odometerEnd: samsaraData.odometerEnd,
            fuelConsumedStart: samsaraData.fuelConsumedStart,
            fuelConsumedEnd: samsaraData.fuelConsumedEnd,
            idleDurationStart: samsaraData.idleDurationStart,
            idleDurationEnd: samsaraData.idleDurationEnd,
            engineHoursStart: samsaraData.engineHoursStart,
            engineHoursEnd: samsaraData.engineHoursEnd,
            rawResponse: samsaraData.rawResponse,
            processedAt: new Date(),
          },
          update: {
            vin: samsaraData.vin,
            vehicleName: samsaraData.vehicleName,
            startTime: samsaraData.startTime,
            endTime: samsaraData.endTime,
            odometerStart: samsaraData.odometerStart,
            odometerEnd: samsaraData.odometerEnd,
            fuelConsumedStart: samsaraData.fuelConsumedStart,
            fuelConsumedEnd: samsaraData.fuelConsumedEnd,
            idleDurationStart: samsaraData.idleDurationStart,
            idleDurationEnd: samsaraData.idleDurationEnd,
            engineHoursStart: samsaraData.engineHoursStart,
            engineHoursEnd: samsaraData.engineHoursEnd,
            rawResponse: samsaraData.rawResponse,
            processedAt: new Date(),
          },
        });
        samsaraRawDataId = samsaraRecord.id;
      } else if (account.provider === TelematicsProvider.MOTIVE) {
        const motiveData = rawResponse as any;
        const motiveRecord = await appClient.motiveRawData.upsert({
          where: {
            clerkOrgId_vehicleId_date: {
              clerkOrgId,
              vehicleId: providerVehicleId,
              date,
            },
          },
          create: {
            clerkOrgId,
            vehicleId: motiveData.vehicleId,
            vin: motiveData.vin,
            vehicleNumber: motiveData.vehicleNumber,
            vehicleName: motiveData.vehicleName,
            date,
            iftaTotalMiles: motiveData.iftaTotalMiles,
            iftaStartDate: motiveData.iftaStartDate,
            iftaEndDate: motiveData.iftaEndDate,
            totalEngineDuration: motiveData.totalEngineDuration,
            totalIdleDuration: motiveData.totalIdleDuration,
            totalDrivingDuration: motiveData.totalDrivingDuration,
            iftaRawResponse: motiveData.iftaRawResponse,
            utilizationRawResponse: motiveData.utilizationRawResponse,
            processedAt: new Date(),
          },
          update: {
            vin: motiveData.vin,
            vehicleNumber: motiveData.vehicleNumber,
            vehicleName: motiveData.vehicleName,
            iftaTotalMiles: motiveData.iftaTotalMiles,
            iftaStartDate: motiveData.iftaStartDate,
            iftaEndDate: motiveData.iftaEndDate,
            totalEngineDuration: motiveData.totalEngineDuration,
            totalIdleDuration: motiveData.totalIdleDuration,
            totalDrivingDuration: motiveData.totalDrivingDuration,
            iftaRawResponse: motiveData.iftaRawResponse,
            utilizationRawResponse: motiveData.utilizationRawResponse,
            processedAt: new Date(),
          },
        });
        motiveRawDataId = motiveRecord.id;
      }

      // 2. Store normalized metrics (linked to provider-specific raw data)
      await appClient.telematicsDailyMetric.upsert({
        where: {
          clerkOrgId_vin_date: {
            clerkOrgId,
            vin: finalVin,
            date,
          },
        },
        create: {
          clerkOrgId,
          vin: finalVin,
          date,
          milesDriven: normalized.milesDriven,
          idleMinutes: normalized.idleMinutes,
          fuelGallons: normalized.fuelGallons,
          avgMpg: normalized.avgMpg,
          engineHours: normalized.engineHours,
          source: account.provider,
          samsaraRawDataId,
          motiveRawDataId,
        },
        update: {
          milesDriven: normalized.milesDriven,
          idleMinutes: normalized.idleMinutes,
          fuelGallons: normalized.fuelGallons,
          avgMpg: normalized.avgMpg,
          engineHours: normalized.engineHours,
          source: account.provider,
          samsaraRawDataId,
          motiveRawDataId,
          updatedAt: new Date(),
        },
      });

      result.metricsCount++;
    }

    // Update account sync status
    await appClient.telematicsProviderAccount.update({
      where: { clerkOrgId },
      data: {
        lastSyncAt: new Date(),
        lastError: null,
        status: TelematicsProviderStatus.ACTIVE,
      },
    });

    result.success = true;
    console.log(`✓ Synced ${result.metricsCount} metrics for org ${clerkOrgId} on ${date}`);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    result.error = errorMessage;
    console.error(`✗ Sync failed for org ${clerkOrgId}:`, errorMessage);

    // Update account error status
    try {
      await appClient.telematicsProviderAccount.update({
        where: { clerkOrgId },
        data: {
          lastError: errorMessage,
          status: TelematicsProviderStatus.ERROR,
        },
      });
    } catch (updateError) {
      console.error('Failed to update error status:', updateError);
    }
  }

  return result;
}

/**
 * Sync all organizations for a specific date
 * Isolates errors per org - one org's failure doesn't stop others
 * 
 * @param date - Date in YYYY-MM-DD format (defaults to yesterday Toronto)
 * @returns Array of sync results
 */
export async function syncAllOrgsForDate(date?: string): Promise<SyncResult[]> {
  const syncDate = date || getYesterdayToronto();
  console.log(`Starting sync for all orgs on ${syncDate}...`);

  const appClient = getAppClient();

  try {
    // Get all ACTIVE provider accounts
    const accounts = await appClient.telematicsProviderAccount.findMany({
      where: {
        status: TelematicsProviderStatus.ACTIVE,
      },
    });

    console.log(`Found ${accounts.length} active telematics accounts`);

    // Sync each org independently
    const results: SyncResult[] = [];
    
    for (const account of accounts) {
      const result = await syncOrgForDate(account.clerkOrgId, syncDate);
      results.push(result);
    }

    // Summary
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    const totalMetrics = results.reduce((sum, r) => sum + r.metricsCount, 0);

    console.log(`\nSync complete for ${syncDate}:`);
    console.log(`  ✓ Success: ${successCount}`);
    console.log(`  ✗ Failed: ${failCount}`);
    console.log(`  📊 Total metrics: ${totalMetrics}`);

    return results;
  } catch (error) {
    console.error('Fatal error in syncAllOrgsForDate:', error);
    throw error;
  }
}
