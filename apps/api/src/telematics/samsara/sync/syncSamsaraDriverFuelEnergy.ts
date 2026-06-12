/**
 * SYNC SAMSARA DRIVER FUEL-ENERGY
 *
 * Source: GET /fleet/reports/drivers/fuel-energy (range-aggregated; called per day).
 * Writes per-driver-per-day rows to samsara_driver_fuel_energy.
 *
 * Note: idle FUEL per driver is not in the API response. We leave
 * engineIdleFuelGallons null. The scorecard tolerates null for idle fuel.
 */

import { appPrisma } from '../../../lib/prisma.js';
import { SamsaraClient } from '../client.js';
import { fetchDriverFuelEnergyReports } from '../endpoints/driverFuelEnergyReports.js';
import { SamsaraConversions } from '../endpoints/fuelEnergyReports.js';
import { SyncResult } from '../types.js';

export async function syncSamsaraDriverFuelEnergy(
  clerkOrgId: string,
  apiToken: string,
  date: string,
  verify: boolean = false
): Promise<SyncResult> {
  const result: SyncResult = {
    endpoint: 'driver_fuel_energy',
    date,
    recordCount: 0,
    newCount: 0,
    updatedCount: 0,
    unchangedCount: 0,
    errorCount: 0,
    errors: [],
  };

  const client = new SamsaraClient(apiToken);
  console.log(`[Samsara] Starting driver fuel-energy sync for org ${clerkOrgId}, date ${date}`);

  try {
    const reports = await fetchDriverFuelEnergyReports(client, date);
    result.recordCount = reports.length;

    if (reports.length === 0) {
      console.log(`[Samsara] No driver fuel-energy data for ${date}`);
      return result;
    }

    for (const r of reports) {
      try {
        const driverId = String(r.driver.id);
        const driverName = r.driver.name ?? null;
        const driverExternalId = r.driver.externalIds
          ? Object.values(r.driver.externalIds)[0] ?? null
          : null;

        const fuelGal = r.fuelConsumedMl != null
          ? SamsaraConversions.millilitersToGallons(r.fuelConsumedMl)
          : null;
        const distMi = r.distanceTraveledMeters != null
          ? SamsaraConversions.metersToMiles(r.distanceTraveledMeters)
          : null;

        const data = {
          driverName,
          driverExternalId,
          totalDistanceMiles: distMi,
          totalFuelUsedGallons: fuelGal,
          engineIdleFuelGallons: null, // not provided by API
          engineRunTimeMs: r.engineRunTimeDurationMs != null ? BigInt(Math.round(r.engineRunTimeDurationMs)) : null,
          engineIdleTimeMs: r.engineIdleTimeDurationMs != null ? BigInt(Math.round(r.engineIdleTimeDurationMs)) : null,
          rawResponse: r as any,
        };

        // Single round-trip upsert. Driver reports can shift inside Samsara's
        // 72h lag, so the row is always written (no changed-vs-unchanged check).
        // Trade-off: we no longer distinguish new from updated in the sync log.
        await appPrisma.samsaraDriverFuelEnergy.upsert({
          where: { clerkOrgId_driverId_date: { clerkOrgId, driverId, date } },
          create: { clerkOrgId, driverId, date, ...data },
          update: data,
        });
        result.updatedCount++;
      } catch (err: any) {
        result.errorCount++;
        result.errors.push({ recordId: String(r.driver?.id ?? 'unknown'), error: err.message });
      }
    }

    console.log(
      `[Samsara] Driver fuel-energy ${date}: ${result.updatedCount} upserted, ${result.errorCount} errors`
    );
    return result;
  } catch (err: any) {
    if (err?.name?.startsWith('Telematics')) throw err;
    console.error(`[Samsara] syncSamsaraDriverFuelEnergy error:`, err);
    result.errorCount = 1;
    result.errors.push({ recordId: 'sync', error: err.message });
    return result;
  }
}
