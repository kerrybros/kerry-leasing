/**
 * SYNC IDLE EVENTS
 * Fetches idle events from Motive API and stores in database
 */

import { appPrisma } from '../../../lib/prisma.js';
import { MotiveClient } from '../client.js';
import { fetchIdleEvents } from '../endpoints/idleEvents.js';
import { SyncResult } from '../types.js';

export async function syncIdleEvents(
  clerkOrgId: string,
  apiKey: string,
  date: string,
  verify: boolean = false
): Promise<SyncResult> {
  const result: SyncResult = {
    endpoint: 'idle_events',
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
    const records = await fetchIdleEvents(client, date);
    
    result.recordCount = records.length;

    // Process each record
    for (const record of records) {
      try {
        // Skip records without driver info
        if (!record.driver || !record.driver.id) {
          console.log(`  ⚠ Skipping idle event ${record.id} with missing driver info`);
          result.errorCount++;
          result.errors.push({
            recordId: record.id,
            error: 'Missing driver information'
          });
          continue;
        }
        
        const motiveEventId = BigInt(record.id);
        
        // Check if record exists
        const existing = await appPrisma.motiveIdleEvent.findUnique({
          where: {
            clerkOrgId_motiveEventId: {
              clerkOrgId,
              motiveEventId
            }
          }
        });

        const recordData = {
          clerkOrgId,
          motiveEventId,
          driverId: record.driver.id,
          driverFirstName: record.driver.first_name || null,
          driverLastName: record.driver.last_name || null,
          driverUsername: record.driver.username || null,
          driverEmail: record.driver.email || null,
          vehicleId: record.vehicle.id,
          vehicleNumber: record.vehicle.number || null,
          vin: record.vehicle.vin || null,
          startTime: record.start_time,
          endTime: record.end_time,
          date, // Derived from start_time
          vehFuelStart: record.veh_fuel_start ?? null,
          vehFuelEnd: record.veh_fuel_end ?? null,
          lat: record.lat ?? null,
          lon: record.lon ?? null,
          city: record.city || null,
          state: record.state || null,
          location: record.location || null,
          rgBrg: record.rg_brg ?? null,
          rgKm: record.rg_km ?? null,
          rgMatch: record.rg_match ?? null,
          endType: record.end_type || null,
          eldDeviceId: record.eld_device_id ?? null,
          eldIdentifier: record.eld_identifier || null,
          rawResponse: record as any,
          lastVerifiedAt: verify ? new Date() : (existing?.lastVerifiedAt || null),
          dataVersion: existing ? existing.dataVersion : 1
        };

        if (!existing) {
          // New record
          await appPrisma.motiveIdleEvent.create({
            data: recordData
          });
          result.newCount++;
        } else {
          // Check if data changed (compare key fields)
          const hasChanged =
            existing.vehFuelStart !== recordData.vehFuelStart ||
            existing.vehFuelEnd !== recordData.vehFuelEnd ||
            existing.endTime !== recordData.endTime ||
            existing.endType !== recordData.endType;

          if (hasChanged) {
            // Update with incremented version
            await appPrisma.motiveIdleEvent.update({
              where: {
                clerkOrgId_motiveEventId: {
                  clerkOrgId,
                  motiveEventId
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
            await appPrisma.motiveIdleEvent.update({
              where: {
                clerkOrgId_motiveEventId: {
                  clerkOrgId,
                  motiveEventId
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
    console.error(`Failed to sync idle events for ${clerkOrgId} on ${date}:`, error);
    throw error;
  }
}

