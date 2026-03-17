/**
 * SYNC FUEL-ENERGY REPORTS
 * Syncs vehicle fuel-energy data from Samsara API to raw data table
 */

import { appPrisma } from '../../../lib/prisma.js';
import { SamsaraClient } from '../client.js';
import { getESTDayBounds } from '../../dates.js';
import {
  fetchFuelEnergyReports,
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
        // Only skip when we cannot form a row: unique key is (clerkOrgId, assetId, startTime)
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

        // Check if record exists
        const existing = await appPrisma.samsaraRawData.findFirst({
          where: { clerkOrgId, vehicleId, date },
        });

        // Store raw API values in source units — conversions happen at read time in the route
        const data = {
          vehicleName,
          vin,
          distanceTraveledMeters: report.distanceTraveledMeters ?? null,
          fuelConsumedMl: report.fuelConsumedMl ?? null,
          engineRunTimeDurationMs: report.engineRunTimeDurationMs != null
            ? BigInt(Math.round(report.engineRunTimeDurationMs))
            : null,
          engineIdleTimeDurationMs: report.engineIdleTimeDurationMs != null
            ? BigInt(Math.round(report.engineIdleTimeDurationMs))
            : null,
          efficiencyMpge: report.efficiencyMpge ?? null,
          // Full raw response kept as audit trail
          rawResponse: report as any,
          processedAt: verify ? new Date() : existing?.processedAt || null,
        };

        if (!existing) {
          await appPrisma.samsaraRawData.create({
            data: { clerkOrgId, vehicleId, date, ...data },
          });
          result.newCount++;
        } else {
          // Compare typed columns; use tolerance for floats to avoid false "updated" from rounding
          const eqFloat = (a: number | null | undefined, b: number | null | undefined, tol = 0.001) =>
            (a == null && b == null) || (a != null && b != null && Math.abs(a - b) <= tol);
          const eqBigInt = (a: bigint | number | null | undefined, b: bigint | number | null | undefined) =>
            (a == null && b == null) || (a != null && b != null && BigInt(a) === BigInt(b));

          const hasChanged =
            !eqFloat(existing.distanceTraveledMeters, data.distanceTraveledMeters) ||
            !eqFloat(existing.fuelConsumedMl, data.fuelConsumedMl) ||
            !eqBigInt(existing.engineRunTimeDurationMs, data.engineRunTimeDurationMs) ||
            !eqBigInt(existing.engineIdleTimeDurationMs, data.engineIdleTimeDurationMs) ||
            !eqFloat(existing.efficiencyMpge, data.efficiencyMpge);

          if (hasChanged) {
            await appPrisma.samsaraRawData.update({ where: { id: existing.id }, data });
            result.updatedCount++;
          } else if (verify) {
            await appPrisma.samsaraRawData.update({
              where: { id: existing.id },
              data: { processedAt: new Date() },
            });
            result.unchangedCount++;
          } else {
            result.unchangedCount++;
          }
        }

        const milesDisplay = data.distanceTraveledMeters != null
          ? (data.distanceTraveledMeters / 1609.34).toFixed(1)
          : '?';
        const galDisplay = data.fuelConsumedMl != null
          ? (data.fuelConsumedMl / 3785.41).toFixed(1)
          : '?';
        console.log(`[Samsara] Processed vehicle ${vehicleName} (${vin || 'no VIN'}): ${milesDisplay} mi, ${galDisplay} gal`);
      } catch (error: any) {
        const errorMsg = `Vehicle ${report.vehicle.name}: ${error.message}`;
        result.errorCount++;
        result.errors.push({ recordId: report.vehicle.id, error: errorMsg });
        console.error(`[Samsara] Error processing vehicle:`, errorMsg);
      }
    }

    console.log(
      `[Samsara] Sync complete for ${date}: ` +
      `${result.newCount} new records added, ${result.unchangedCount} preexisting records unchanged, ${result.updatedCount} updated (overwritten)` +
      (result.errorCount > 0 ? `, ${result.errorCount} errors` : '')
    );

    return result;
  } catch (error: any) {
    console.error(`[Samsara] syncFuelEnergyReports error:`, error);
    result.errorCount = 1;
    result.errors.push({ recordId: 'sync', error: error.message });
    return result;
  }
}
