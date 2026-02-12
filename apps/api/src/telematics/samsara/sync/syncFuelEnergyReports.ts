/**
 * SYNC FUEL-ENERGY REPORTS
 * Syncs vehicle fuel-energy data from Samsara API to raw data table
 */

import { appPrisma } from '../../../lib/prisma.js';
import { SamsaraClient } from '../client.js';
import { getESTDayBounds } from '../../dates.js';
import {
  fetchFuelEnergyReports,
  SamsaraConversions,
  SamsaraVehicleReport,
} from '../endpoints/fuelEnergyReports.js';
import { fetchIdlingEventsRaw } from '../endpoints/idlingEvents.js';
import { SyncResult } from '../types.js';

export async function syncFuelEnergyReports(
  clerkOrgId: string,
  apiToken: string,
  date: string,
  verify: boolean = false
): Promise<SyncResult> {
  const result: SyncResult = {
    endpoint: 'fuel_energy',
    date,
    recordCount: 0,
    newCount: 0,
    updatedCount: 0,
    unchangedCount: 0,
    errorCount: 0,
    errors: [],
  };

  const client = new SamsaraClient(apiToken);
  console.log(`[Samsara] Starting fuel-energy sync for org ${clerkOrgId}, date ${date}`);

  try {
    const reports = await fetchFuelEnergyReports(client, date);

    // Fetch and store all idling events (same EST day bounds as fuel-energy)
    const { startTime, endTime } = getESTDayBounds(date);
    try {
      const rawEvents = await fetchIdlingEventsRaw(client, startTime, endTime);
      let stored = 0;
      for (const event of rawEvents) {
        const assetId = event.asset?.id;
        if (assetId == null || !event.startTime) continue;
        const vehicleId = String(assetId);
        const eventDate = date; // EST calendar day we're syncing (same as fuel-energy)
        await appPrisma.samsaraIdlingEvent.upsert({
          where: {
            clerkOrgId_assetId_startTime: { clerkOrgId, assetId: vehicleId, startTime: event.startTime },
          },
          create: {
            clerkOrgId,
            assetId: vehicleId,
            startTime: event.startTime,
            durationMilliseconds: event.durationMilliseconds ?? null,
            fuelConsumedMilliliters: event.fuelConsumedMilliliters ?? null,
            eventDate,
            rawResponse: event as any,
          },
          update: {
            durationMilliseconds: event.durationMilliseconds ?? null,
            fuelConsumedMilliliters: event.fuelConsumedMilliliters ?? null,
            rawResponse: event as any,
          },
        });
        stored++;
      }
      if (stored > 0) {
        console.log(`[Samsara] Idling events: stored ${stored} raw events for ${date}`);
      }
    } catch (idleErr: any) {
      console.warn(`[Samsara] Idling events fetch failed (continuing):`, idleErr.message);
    }

    if (reports.length === 0) {
      console.log(`[Samsara] No vehicles found for ${date}`);
      return result;
    }

    result.recordCount = reports.length;

    // Process each vehicle report
    for (const report of reports) {
      try {
        const vin = report.vehicle.externalIds?.['samsara.vin'] || null;
        const vehicleId = String(report.vehicle.id); // match idling events assetId when joining in API
        const vehicleName = report.vehicle.name;

        // Convert metrics to our standard units
        const milesDriven = SamsaraConversions.metersToMiles(report.distanceTraveledMeters);
        const fuelGallons = SamsaraConversions.millilitersToGallons(report.fuelConsumedMl);
        const engineHours = SamsaraConversions.millisecondsToHours(report.engineRunTimeDurationMs);
        const idleMinutes = SamsaraConversions.millisecondsToMinutes(report.engineIdleTimeDurationMs);
        // Idle fuel is aggregated on read from SamsaraIdlingEvent (assetId = vehicle.id); not stored here

        // Check if record exists
        const existing = await appPrisma.samsaraRawData.findFirst({
          where: {
            clerkOrgId,
            vehicleId,
            date,
          },
        });

        const data = {
          vehicleName,
          vin,
          startTime: null, // Not provided by fuel-energy endpoint
          endTime: null,   // Not provided by fuel-energy endpoint
          
          // Raw metric values (in Samsara's units for reference)
          odometerStart: null, // Not provided (only distance traveled)
          odometerEnd: null,
          fuelConsumedStart: null, // Not provided (only total consumed)
          fuelConsumedEnd: null,
          idleDurationStart: null, // Not provided (only total duration)
          idleDurationEnd: null,
          engineHoursStart: null, // Not provided (only total duration)
          engineHoursEnd: null,
          
          // Store converted values in raw response for easy access
          rawResponse: {
            ...report,
            convertedMetrics: {
              milesDriven,
              fuelGallons,
              engineHours,
              idleMinutes,
              avgMpg: report.efficiencyMpge,
            },
          },
          processedAt: verify ? new Date() : existing?.processedAt || null,
        };

        if (existing) {
          await appPrisma.samsaraRawData.update({
            where: { id: existing.id },
            data,
          });
          result.updatedCount++;
        } else {
          await appPrisma.samsaraRawData.create({
            data: {
              clerkOrgId,
              vehicleId,
              date,
              ...data,
            },
          });
          result.newCount++;
        }

        console.log(
          `[Samsara] Processed vehicle ${vehicleName} (${vin || 'no VIN'}): ` +
          `${milesDriven.toFixed(1)} mi, ${fuelGallons.toFixed(1)} gal, ` +
          `${engineHours.toFixed(1)} hrs engine, ${idleMinutes.toFixed(0)} min idle`
        );
      } catch (error: any) {
        const errorMsg = `Vehicle ${report.vehicle.name}: ${error.message}`;
        result.errorCount++;
        result.errors.push({ recordId: report.vehicle.id, error: errorMsg });
        console.error(`[Samsara] Error processing vehicle:`, errorMsg);
      }
    }

    console.log(
      `[Samsara] Sync complete for ${date}: ` +
      `${result.recordCount} vehicles, ${result.newCount} new, ${result.updatedCount} updated, ` +
      `${result.unchangedCount} unchanged, ${result.errorCount} errors`
    );

    return result;
  } catch (error: any) {
    console.error(`[Samsara] syncFuelEnergyReports error:`, error);
    result.errorCount = 1;
    result.errors.push({ recordId: 'sync', error: error.message });
    return result;
  }
}
