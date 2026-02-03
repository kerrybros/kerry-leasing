/**
 * SYNC VEHICLE UTILIZATION
 * Fetches vehicle utilization from Motive API and stores in database
 */

import { appPrisma } from '../../../lib/prisma';
import { MotiveClient } from '../client';
import { fetchVehicleUtilization } from '../endpoints/vehicleUtilization';
import { SyncResult } from '../types';

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
    errors: []
  };

  try {
    // Create client and fetch data
    const client = new MotiveClient(apiKey);
    const records = await fetchVehicleUtilization(client, date);
    
    result.recordCount = records.length;

    // Process each record
    for (const record of records) {
      try {
        const vehicleId = record.vehicle.id;
        
        // Check if record exists
        const existing = await appPrisma.motiveVehicleUtilization.findUnique({
          where: {
            clerkOrgId_vehicleId_date: {
              clerkOrgId,
              vehicleId,
              date
            }
          }
        });

        const recordData = {
          clerkOrgId,
          vehicleId,
          vehicleNumber: record.vehicle.number || null,
          vin: record.vehicle.vin || null,
          date,
          lastLocatedAt: record.last_located_at || null,
          utilizationPercentage: record.utilization ?? null,
          idleTime: record.idle_time ?? null,
          idleFuel: record.idle_fuel ?? null,
          drivingTime: record.driving_time ?? null,
          drivingFuel: record.driving_fuel ?? null,
          totalFuel: record.total_fuel ?? null,
          totalDistance: record.total_distance ?? null,
          message: record.message || null,
          rawResponse: record as any,
          lastVerifiedAt: verify ? new Date() : (existing?.lastVerifiedAt || null),
          dataVersion: existing ? existing.dataVersion : 1
        };

        if (!existing) {
          // New record
          await appPrisma.motiveVehicleUtilization.create({
            data: recordData
          });
          result.newCount++;
        } else {
          // Check if data changed (compare key fields)
          const hasChanged =
            existing.utilizationPercentage !== recordData.utilizationPercentage ||
            existing.idleTime !== recordData.idleTime ||
            existing.drivingTime !== recordData.drivingTime ||
            existing.totalFuel !== recordData.totalFuel ||
            existing.totalDistance !== recordData.totalDistance;

          if (hasChanged) {
            // Update with incremented version
            await appPrisma.motiveVehicleUtilization.update({
              where: {
                clerkOrgId_vehicleId_date: {
                  clerkOrgId,
                  vehicleId,
                  date
                }
              },
              data: {
                ...recordData,
                dataVersion: existing.dataVersion + 1
              }
            });
            result.updatedCount++;
          } else if (verify) {
            // No change but update verification timestamp
            await appPrisma.motiveVehicleUtilization.update({
              where: {
                clerkOrgId_vehicleId_date: {
                  clerkOrgId,
                  vehicleId,
                  date
                }
              },
              data: {
                lastVerifiedAt: new Date()
              }
            });
            result.unchangedCount++;
          } else {
            result.unchangedCount++;
          }
        }
      } catch (error: any) {
        result.errorCount++;
        result.errors.push({
          recordId: record.vehicle.id,
          error: error.message
        });
      }
    }

    return result;
  } catch (error: any) {
    console.error(`Failed to sync vehicle utilization for ${clerkOrgId} on ${date}:`, error);
    throw error;
  }
}
