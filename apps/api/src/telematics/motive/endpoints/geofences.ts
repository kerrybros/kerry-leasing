/**
 * GEOFENCES ENDPOINT
 * Fetches geofences (location zones) from Motive
 * No date parameters - this is configuration data
 */

import { MotiveClient } from '../client';
import { MotiveGeofencesResponse } from '../types';

export async function fetchGeofences(
  client: MotiveClient
): Promise<MotiveGeofencesResponse['geofences'][0]['geofence'][]> {
  try {
    const results = await client.get<MotiveGeofencesResponse['geofences'][0]['geofence']>(
      '/v1/geofences',
      {}
    );

    console.log(`✓ Fetched ${results.length} geofences`);
    return results;
  } catch (error) {
    console.error(`✗ Failed to fetch geofences:`, error);
    throw error;
  }
}
