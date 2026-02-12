/**
 * SYNC DRIVING PERIODS
 * Fetches driving periods from Motive API and stores in database
 */

import { appPrisma } from '../../../lib/prisma.js';
import { MotiveClient } from '../client.js';
import { fetchDrivingPeriods } from '../endpoints/drivingPeriods.js';
import { SyncResult } from '../types.js';

export async function syncDrivingPeriods(
  clerkOrgId: string,
  apiKey: string,
  date: string,
  verify: boolean = false
): Promise<SyncResult> {
  const result: SyncResult = {
    endpoint: 'driving_periods',
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
    const records = await fetchDrivingPeriods(client, date);
    
    result.recordCount = records.length;

    // Process each record (include periods with or without driver for full data capture)
    for (const record of records) {
      try {
        const motivePeriodId = BigInt(record.id);
        
        // Check if record exists
        const existing = await appPrisma.motiveDrivingPeriod.findUnique({
          where: {
            clerkOrgId_motivePeriodId: {
              clerkOrgId,
              motivePeriodId
            }
          }
        });

        const recordData = {
          clerkOrgId,
          motivePeriodId,
          driverId: record.driver?.id ?? null,
          driverFirstName: record.driver?.first_name || null,
          driverLastName: record.driver?.last_name || null,
          driverUsername: record.driver?.username || null,
          driverEmail: record.driver?.email || null,
          vehicleId: record.vehicle.id,
          vehicleNumber: record.vehicle.number || null,
          vin: record.vehicle.vin || null,
          startTime: record.start_time,
          endTime: record.end_time || null,
          date, // Derived from start_time
          duration: record.duration ?? null,
          status: record.status || null,
          type: record.type || null,
          annotationStatus: record.annotation_status ?? null,
          notes: record.notes || null,
          source: record.source ?? null,
          startKilometers: record.start_kilometers ?? null,
          endKilometers: record.end_kilometers ?? null,
          distance: record.distance || null,
          origin: record.origin || null,
          originLat: record.origin_lat ?? null,
          originLon: record.origin_lon ?? null,
          destination: record.destination || null,
          destinationLat: record.destination_lat ?? null,
          destinationLon: record.destination_lon ?? null,
          startHvbStateOfCharge: record.start_hvb_state_of_charge ?? null,
          endHvbStateOfCharge: record.end_hvb_state_of_charge ?? null,
          startHvbLifetimeEnergyOutput: record.start_hvb_lifetime_energy_output ?? null,
          endHvbLifetimeEnergyOutput: record.end_hvb_lifetime_energy_output ?? null,
          rawResponse: record as any,
          lastVerifiedAt: verify ? new Date() : (existing?.lastVerifiedAt || null),
          dataVersion: existing ? existing.dataVersion : 1
        };

        if (!existing) {
          // New record
          await appPrisma.motiveDrivingPeriod.create({
            data: recordData
          });
          result.newCount++;
        } else {
          // Check if data changed (compare key fields)
          const hasChanged =
            existing.endTime !== recordData.endTime ||
            existing.duration !== recordData.duration ||
            existing.status !== recordData.status ||
            existing.endKilometers !== recordData.endKilometers ||
            existing.destination !== recordData.destination;

          if (hasChanged) {
            // Update with incremented version
            await appPrisma.motiveDrivingPeriod.update({
              where: {
                clerkOrgId_motivePeriodId: {
                  clerkOrgId,
                  motivePeriodId
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
            await appPrisma.motiveDrivingPeriod.update({
              where: {
                clerkOrgId_motivePeriodId: {
                  clerkOrgId,
                  motivePeriodId
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
          recordId: record.id,
          error: error.message
        });
      }
    }

    return result;
  } catch (error: any) {
    console.error(`Failed to sync driving periods for ${clerkOrgId} on ${date}:`, error);
    throw error;
  }
}

