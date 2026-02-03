/**
 * DRIVING PERIODS ENDPOINT
 * Fetches driving periods (trips) from Motive for a specific date
 * Uses start_date/end_date parameters (YYYY-MM-DD format)
 */

import { MotiveClient } from '../client.js';
import { MotiveDrivingPeriodsResponse } from '../types.js';

export async function fetchDrivingPeriods(
  client: MotiveClient,
  date: string, // YYYY-MM-DD
  vehicleIds?: number[]
): Promise<MotiveDrivingPeriodsResponse['driving_periods'][0]['driving_period'][]> {
  const params: Record<string, any> = {
    start_date: date,
    end_date: date // Single day range
  };

  // Optional: filter by specific vehicles
  if (vehicleIds && vehicleIds.length > 0) {
    params.vehicle_ids = vehicleIds.join(',');
  }

  try {
    const results = await client.get<MotiveDrivingPeriodsResponse['driving_periods'][0]['driving_period']>(
      '/v1/driving_periods',
      params
    );

    console.log(`✓ Fetched ${results.length} driving periods for ${date}`);
    return results;
  } catch (error) {
    console.error(`✗ Failed to fetch driving periods for ${date}:`, error);
    throw error;
  }
}

