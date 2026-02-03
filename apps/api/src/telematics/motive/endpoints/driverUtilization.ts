/**
 * DRIVER UTILIZATION ENDPOINT
 * Fetches daily driver utilization metrics from Motive
 */

import { MotiveClient } from '../client';
import { MotiveDriverUtilizationResponse } from '../types';

export async function fetchDriverUtilization(
  client: MotiveClient,
  date: string, // YYYY-MM-DD
  driverIds?: number[]
): Promise<MotiveDriverUtilizationResponse['driver_idle_rollups'][0]['driver_idle_rollup'][]> {
  const params: Record<string, any> = {
    start_date: date,  // YYYY-MM-DD format
    end_date: date     // YYYY-MM-DD format
  };

  // Optional: filter by specific drivers
  if (driverIds && driverIds.length > 0) {
    params.driver_ids = driverIds.join(',');
  }

  try {
    const results = await client.get<MotiveDriverUtilizationResponse['driver_idle_rollups'][0]['driver_idle_rollup']>(
      '/v2/driver_utilization',
      params
    );

    console.log(`✓ Fetched ${results.length} driver utilization records for ${date}`);
    return results;
  } catch (error) {
    console.error(`✗ Failed to fetch driver utilization for ${date}:`, error);
    throw error;
  }
}
