/**
 * SYNC GEOFENCES
 * Fetches geofences from Motive API and stores in database
 * NOTE: Geofences are configuration data, not transactional - no verification needed
 */

import { appPrisma } from '../../../lib/prisma.js';
import { MotiveClient } from '../client.js';
import { fetchGeofences } from '../endpoints/geofences.js';
import { SyncResult } from '../types.js';

export async function syncGeofences(
  clerkOrgId: string,
  apiKey: string
): Promise<SyncResult> {
  const result: SyncResult = {
    endpoint: 'geofences',
    date: 'N/A',
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
    const records = await fetchGeofences(client);
    
    result.recordCount = records.length;

    // Process each record
    for (const record of records) {
      try {
        const motiveGeofenceId = record.id;
        
        // Check if record exists
        const existing = await appPrisma.motiveGeofence.findUnique({
          where: {
            clerkOrgId_motiveGeofenceId: {
              clerkOrgId,
              motiveGeofenceId
            }
          }
        });

        const recordData = {
          clerkOrgId,
          motiveGeofenceId,
          name: record.name,
          status: record.status,
          address: record.address || null,
          description: record.description || null,
          category: record.category || null,
          locationPoints: record.location_points as any,
          rawResponse: record as any
        };

        if (!existing) {
          // New record
          await appPrisma.motiveGeofence.create({
            data: recordData
          });
          result.newCount++;
        } else {
          // Always update geofences (config data changes)
          await appPrisma.motiveGeofence.update({
            where: {
              clerkOrgId_motiveGeofenceId: {
                clerkOrgId,
                motiveGeofenceId
              }
            },
            data: recordData
          });
          result.updatedCount++;
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
    console.error(`Failed to sync geofences for ${clerkOrgId}:`, error);
    throw error;
  }
}

