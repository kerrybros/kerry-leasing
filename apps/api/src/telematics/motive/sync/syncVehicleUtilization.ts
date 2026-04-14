/**
 * SYNC VEHICLE UTILIZATION (Motive v2)
 * Fetches vehicle utilization from Motive v2 API and stores in motive_vehicle_utilization.
 *
 * Unit normalization at write time:
 *   idle_time, driving_time: seconds → minutes (stored as minutes for consistent frontend contract)
 *   idle_fuel, driving_fuel, total_fuel: gallons (API already returns imperial with X-Metric-Units: false)
 *   total_distance: miles (API already returns imperial)
 */

import { appPrisma } from '../../../lib/prisma.js';
import { MotiveClient } from '../client.js';
import { fetchVehicleUtilization } from '../endpoints/vehicleUtilization.js';
import { SyncResult } from '../types.js';

export async function syncVehicleUtilization(
  clerkOrgId: string,
  apiKey: string,
  date: string,
  verify: boolean = false
): Promise<SyncResult> {
  const result: SyncResult = {
    endpoint: 'vehicle_utilization',
    date,
    recordCount: 0,
    newCount: 0,
    updatedCount: 0,
    unchangedCount: 0,
    errorCount: 0,
    errors: [],
  };

  try {
    const client = new MotiveClient(apiKey);
    const records = await fetchVehicleUtilization(client, date);
    result.recordCount = records.length;

    for (const record of records) {
      try {
        const vehicleId = record.vehicle.id;

        // Normalize seconds → minutes at write time
        const idleTimeMin = record.idle_time != null ? Math.round(record.idle_time / 60) : null;
        const drivingTimeMin = record.driving_time != null ? Math.round(record.driving_time / 60) : null;

        const existing = await appPrisma.motiveVehicleUtilization.findUnique({
          where: { clerkOrgId_vehicleId_date: { clerkOrgId, vehicleId, date } },
        });

        const recordData = {
          clerkOrgId,
          vehicleId,
          vehicleNumber: record.vehicle.number || null,
          vin: record.vehicle.vin || null,
          date,
          lastLocatedAt: null,
          utilizationPercentage: record.utilization ?? null,
          idleTime: idleTimeMin,          // stored in minutes
          idleFuel: record.idle_fuel ?? null,
          drivingTime: drivingTimeMin,    // stored in minutes
          drivingFuel: record.driving_fuel ?? null,
          totalFuel: record.total_fuel ?? (
            record.idle_fuel != null && record.driving_fuel != null
              ? record.idle_fuel + record.driving_fuel
              : null
          ),
          totalDistance: record.total_distance ?? null,
          message: record.message || null,
          rawResponse: record as any,
          lastVerifiedAt: verify ? new Date() : (existing?.lastVerifiedAt || null),
          dataVersion: existing ? existing.dataVersion : 1,
        };

        if (!existing) {
          await appPrisma.motiveVehicleUtilization.create({ data: recordData });
          result.newCount++;
        } else {
          const hasChanged =
            existing.utilizationPercentage !== recordData.utilizationPercentage ||
            existing.idleTime !== recordData.idleTime ||
            existing.idleFuel !== recordData.idleFuel ||
            existing.drivingTime !== recordData.drivingTime ||
            existing.drivingFuel !== recordData.drivingFuel ||
            existing.totalFuel !== recordData.totalFuel ||
            existing.totalDistance !== recordData.totalDistance;

          if (hasChanged) {
            await appPrisma.motiveVehicleUtilization.update({
              where: { clerkOrgId_vehicleId_date: { clerkOrgId, vehicleId, date } },
              data: { ...recordData, dataVersion: existing.dataVersion + 1 },
            });
            result.updatedCount++;
          } else if (verify) {
            await appPrisma.motiveVehicleUtilization.update({
              where: { clerkOrgId_vehicleId_date: { clerkOrgId, vehicleId, date } },
              data: { lastVerifiedAt: new Date() },
            });
            result.unchangedCount++;
          } else {
            result.unchangedCount++;
          }
        }
      } catch (error: any) {
        result.errorCount++;
        result.errors.push({ recordId: record.vehicle.id, error: error.message });
      }
    }

    return result;
  } catch (error: any) {
    console.error(`Failed to sync vehicle utilization for ${clerkOrgId} on ${date}:`, error);
    throw error;
  }
}
