/**
 * VEHICLE UTILIZATION ENDPOINT — Motive v2
 * Fetches daily vehicle utilization metrics using the v2 API endpoint.
 *
 * Uses UTC midnight-to-midnight boundaries: start_at = YYYY-MM-DDT00:00:00Z,
 * end_at = next day T00:00:00Z. Validated against Motive dashboard CSV.
 *
 * Unit notes from API (with X-Metric-Units: false):
 *   idle_time, driving_time → seconds (normalized to minutes at write time in sync layer)
 *   idle_fuel, driving_fuel → gallons
 *   total_distance          → miles
 */

import { MotiveClient } from '../client.js';

export interface MotiveV2VehicleUtilRecord {
  vehicle: { id: number; number?: string; vin?: string };
  utilization?: number;
  idle_time?: number;    // seconds
  idle_fuel?: number;    // gallons
  driving_time?: number; // seconds
  driving_fuel?: number; // gallons
  total_distance?: number; // miles
  total_fuel?: number;   // gallons (idle + driving)
  message?: string;
}

/**
 * Fetch vehicle utilization for a UTC calendar day.
 *
 * Motive dashboard uses UTC midnight-to-midnight day boundaries.
 * start_at = YYYY-MM-DDT00:00:00Z (midnight UTC, inclusive)
 * end_at   = YYYY-MM-DDT00:00:00Z for the NEXT day (exclusive boundary — captures the full UTC day)
 *
 * Validated against dashboard CSV: distance and idle time match within 0%, drive time within ~4%.
 */
export async function fetchVehicleUtilization(
  client: MotiveClient,
  date: string // YYYY-MM-DD (UTC calendar day)
): Promise<MotiveV2VehicleUtilRecord[]> {
  const startAt = `${date}T00:00:00Z`;
  // next day midnight UTC — Motive's end_at is exclusive so this captures the full 24h UTC day
  const [y, m, d] = date.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  const endAt = next.toISOString().replace('.000Z', 'Z').slice(0, 20) + 'Z';

  try {
    const records = await client.get<MotiveV2VehicleUtilRecord>(
      '/v2/vehicle_utilization',
      { start_at: startAt, end_at: endAt }
    );
    console.log(`✓ Fetched ${records.length} vehicle utilization records for ${date} (v2, UTC bounds ${startAt}→${endAt})`);
    return records;
  } catch (error) {
    console.error(`✗ Failed to fetch v2 vehicle utilization for ${date}:`, error);
    throw error;
  }
}
