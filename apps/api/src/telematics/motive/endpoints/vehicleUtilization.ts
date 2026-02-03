/**
 * VEHICLE UTILIZATION ENDPOINT
 * Fetches daily vehicle utilization metrics from Motive
 */

import { MotiveClient } from '../client';
import { MotiveVehicleUtilizationResponse } from '../types';

export async function fetchVehicleUtilization(
  client: MotiveClient,
  date: string, // YYYY-MM-DD
  vehicleIds?: number[]
): Promise<MotiveVehicleUtilizationResponse['results']> {
  const params: Record<string, any> = {
    start_at: `${date}T00:00:00Z`,  // Start of day
    end_at: `${date}T23:59:59Z`     // End of day
  };

  // Optional: filter by specific vehicles
  if (vehicleIds && vehicleIds.length > 0) {
    params.vehicle_ids = vehicleIds.join(',');
  }

  try {
    const results = await client.get<MotiveVehicleUtilizationResponse['results'][0]>(
      '/v2/vehicle_utilization',
      params
    );

    console.log(`✓ Fetched ${results.length} vehicle utilization records for ${date}`);
    return results;
  } catch (error) {
    console.error(`✗ Failed to fetch vehicle utilization for ${date}:`, error);
    throw error;
  }
}
