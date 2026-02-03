/**
 * IDLE EVENTS ENDPOINT
 * Fetches idle events from Motive for a specific date
 * Uses start_date/end_date parameters (YYYY-MM-DD format)
 */

import { MotiveClient } from '../client.js';
import { MotiveIdleEventsResponse } from '../types.js';

export async function fetchIdleEvents(
  client: MotiveClient,
  date: string, // YYYY-MM-DD
  vehicleIds?: number[]
): Promise<MotiveIdleEventsResponse['idle_events'][0]['idle_event'][]> {
  const params: Record<string, any> = {
    start_date: date,
    end_date: date // Single day range
  };

  // Optional: filter by specific vehicles
  if (vehicleIds && vehicleIds.length > 0) {
    params.vehicle_ids = vehicleIds.join(',');
  }

  try {
    const results = await client.get<MotiveIdleEventsResponse['idle_events'][0]['idle_event']>(
      '/v1/idle_events',
      params
    );

    console.log(`✓ Fetched ${results.length} idle events for ${date}`);
    return results;
  } catch (error) {
    console.error(`✗ Failed to fetch idle events for ${date}:`, error);
    throw error;
  }
}

