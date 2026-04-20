/**
 * SYNC DRIVER UTILIZATION
 * Fetches driver utilization from Motive API and stores in database
 */

import { appPrisma } from '../../../lib/prisma.js';
import { MotiveClient } from '../client.js';
import { fetchDriverUtilization } from '../endpoints/driverUtilization.js';
import { SyncResult } from '../types.js';

export async function syncDriverUtilization(
  clerkOrgId: string,
  apiKey: string,
  date: string,
  verify: boolean = false
): Promise<SyncResult> {
  const result: SyncResult = {
    endpoint: 'driver_utilization',
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
    const records = await fetchDriverUtilization(client, date);
    
    result.recordCount = records.length;
    for (const record of records) {
      try {
        const driverId = record.driver?.id ?? null;

        // Skip unassigned records — no driver to attribute, and composite key requires non-null driverId
        if (driverId === null) {
          result.recordCount--;
          continue;
        }

        // Check if record exists
        const existing = await appPrisma.motiveDriverUtilization.findUnique({
          where: {
            clerkOrgId_driverId_date: {
              clerkOrgId,
              driverId,
              date
            }
          }
        });

        const recordData = {
          clerkOrgId,
          driverId,
          driverFirstName: record.driver?.first_name || null,
          driverLastName: record.driver?.last_name || null,
          driverUsername: record.driver?.username || null,
          driverEmail: record.driver?.email || null,
          date,
          utilization: record.utilization ?? null,
          idleTime: record.idle_time ?? null,
          drivingTime: record.driving_time ?? null,
          idleFuel: record.idle_fuel ?? null,
          drivingFuel: record.driving_fuel ?? null,
          rawResponse: record as any,
          lastVerifiedAt: verify ? new Date() : (existing?.lastVerifiedAt || null),
          dataVersion: existing ? existing.dataVersion : 1
        };

        if (!existing) {
          // New record
          await appPrisma.motiveDriverUtilization.create({
            data: recordData
          });
          result.newCount++;
        } else {
          // Check if data changed (compare key fields)
          const hasChanged =
            existing.utilization !== recordData.utilization ||
            existing.idleTime !== recordData.idleTime ||
            existing.drivingTime !== recordData.drivingTime ||
            existing.idleFuel !== recordData.idleFuel ||
            existing.drivingFuel !== recordData.drivingFuel;

          if (hasChanged) {
            // Update with incremented version
            await appPrisma.motiveDriverUtilization.update({
              where: {
                clerkOrgId_driverId_date: {
                  clerkOrgId,
                  driverId,
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
            await appPrisma.motiveDriverUtilization.update({
              where: {
                clerkOrgId_driverId_date: {
                  clerkOrgId,
                  driverId,
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
          recordId: String(record.driver?.id ?? 'no-driver'),
          error: error.message
        });
      }
    }

    return result;
  } catch (error: any) {
    console.error(`Failed to sync driver utilization for ${clerkOrgId} on ${date}:`, error);
    throw error;
  }
}

