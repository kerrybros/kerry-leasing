/**
 * SYNC FUEL-ENERGY REPORTS
 * Syncs vehicle fuel-energy data from Samsara API.
 *
 * Write target: samsara_vehicle_utilization (normalized units converted at write time).
 *   mL → gal (÷3785.41), meters → miles (÷1609.34), ms → minutes (÷60000)
 *
 * Also fetches and stores raw idling events in samsara_idling_events so that
 * idle fuel (summed per vehicle) can populate idleFuelGallons on the util row.
 */

import { appPrisma } from '../../../lib/prisma.js';
import { SamsaraClient } from '../client.js';
import { getESTDayBounds } from '../../dates.js';
import {
  fetchFuelEnergyReports,
  SamsaraConversions,
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

    // Fetch idling events for the same EST day — store raw + compute per-vehicle idle fuel sum
    const { startTime, endTime } = getESTDayBounds(date);
    const idleFuelByVehicle = new Map<string, number>(); // vehicleId → gallons

    try {
      const rawEvents = await fetchIdlingEventsRaw(client, startTime, endTime);
      let storedIdleEvents = 0;

      for (const event of rawEvents) {
        const assetId = event.asset?.id;
        if (assetId == null || !event.startTime) continue;
        const vehicleId = String(assetId);
        const eventDate = date;

        // Store raw idling event
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
        storedIdleEvents++;

        // Accumulate idle fuel per vehicle (mL → gal)
        if (event.fuelConsumedMilliliters != null) {
          const gallons = SamsaraConversions.millilitersToGallons(event.fuelConsumedMilliliters);
          idleFuelByVehicle.set(vehicleId, (idleFuelByVehicle.get(vehicleId) ?? 0) + gallons);
        }
      }

      if (storedIdleEvents > 0) {
        console.log(`[Samsara] Idling events: stored ${storedIdleEvents} raw events for ${date}`);
      }
    } catch (idleErr: any) {
      console.warn(`[Samsara] Idling events fetch failed (continuing):`, idleErr.message);
    }

    if (reports.length === 0) {
      console.log(`[Samsara] No vehicles found for ${date}`);
      return result;
    }

    result.recordCount = reports.length;

    for (const report of reports) {
      try {
        const vehicleId = String(report.vehicle.id);
        const vin = report.vehicle.externalIds?.['samsara.vin'] || null;
        const vehicleName = report.vehicle.name;

        // Convert all units at write time
        const fuelGallons = SamsaraConversions.millilitersToGallons(report.fuelConsumedMl ?? 0);
        const distanceMiles = SamsaraConversions.metersToMiles(report.distanceTraveledMeters ?? 0);
        const engineOnMinutes = SamsaraConversions.millisecondsToMinutes(report.engineRunTimeDurationMs ?? 0);
        const idleMinutes = SamsaraConversions.millisecondsToMinutes(report.engineIdleTimeDurationMs ?? 0);
        const drivingMinutes = Math.max(0, engineOnMinutes - idleMinutes);
        const idleFuelGallons = idleFuelByVehicle.get(vehicleId) ?? null;
        const mpg = fuelGallons > 0 ? distanceMiles / fuelGallons : null;

        const data = {
          vehicleName,
          vin,
          fuelGallons: report.fuelConsumedMl != null ? fuelGallons : null,
          distanceMiles: report.distanceTraveledMeters != null ? distanceMiles : null,
          engineOnMinutes: report.engineRunTimeDurationMs != null ? engineOnMinutes : null,
          drivingMinutes: report.engineRunTimeDurationMs != null ? drivingMinutes : null,
          idleMinutes: report.engineIdleTimeDurationMs != null ? idleMinutes : null,
          idleFuelGallons,
          mpg: mpg != null && isFinite(mpg) ? mpg : null,
          processedAt: verify ? new Date() : undefined,
        };

        const existing = await appPrisma.samsaraVehicleUtilization.findUnique({
          where: { clerkOrgId_vehicleId_date: { clerkOrgId, vehicleId, date } },
        });

        if (!existing) {
          await appPrisma.samsaraVehicleUtilization.create({
            data: { clerkOrgId, vehicleId, date, ...data },
          });
          result.newCount++;
        } else {
          const eqF = (a: number | null | undefined, b: number | null | undefined, tol = 0.001) =>
            (a == null && b == null) || (a != null && b != null && Math.abs(a - b) <= tol);

          const hasChanged =
            !eqF(existing.fuelGallons, data.fuelGallons) ||
            !eqF(existing.distanceMiles, data.distanceMiles) ||
            !eqF(existing.engineOnMinutes, data.engineOnMinutes) ||
            !eqF(existing.idleMinutes, data.idleMinutes) ||
            !eqF(existing.idleFuelGallons, data.idleFuelGallons);

          if (hasChanged || verify) {
            await appPrisma.samsaraVehicleUtilization.update({
              where: { id: existing.id },
              data: { ...data, processedAt: new Date() },
            });
            result.updatedCount++;
          } else {
            result.unchangedCount++;
          }
        }

        console.log(
          `[Samsara] Vehicle ${vehicleName} (${vin ?? 'no VIN'}): ` +
          `${distanceMiles.toFixed(1)} mi, ${fuelGallons.toFixed(2)} gal` +
          (idleFuelGallons != null ? `, ${idleFuelGallons.toFixed(2)} gal idle` : '')
        );
      } catch (error: any) {
        result.errorCount++;
        result.errors.push({ recordId: report.vehicle.id, error: error.message });
        console.error(`[Samsara] Error processing vehicle ${report.vehicle.name}:`, error.message);
      }
    }

    console.log(
      `[Samsara] Sync complete for ${date}: ` +
      `${result.newCount} new, ${result.unchangedCount} unchanged, ${result.updatedCount} updated` +
      (result.errorCount > 0 ? `, ${result.errorCount} errors` : '')
    );

    return result;
  } catch (error: any) {
    if (error?.name?.startsWith('Telematics')) throw error;
    console.error(`[Samsara] syncFuelEnergyReports error:`, error);
    result.errorCount = 1;
    result.errors.push({ recordId: 'sync', error: error.message });
    return result;
  }
}
