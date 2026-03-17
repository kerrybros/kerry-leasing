/**
 * VEHICLE UTILIZATION ENDPOINT
 * Fetches daily vehicle utilization metrics from Motive v1 API.
 * Uses start_date/end_date for the requested Eastern calendar day.
 * Response is normalized to a single shape for the sync layer.
 */

import { MotiveClient } from '../client.js';
import type {
  MotiveVehicleUtilizationRecord,
  MotiveVehicleUtilizationV1Rollup,
} from '../types.js';

function toNumber(value: number | string | undefined | null): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isNaN(value) ? null : value;
  const n = parseFloat(String(value));
  return Number.isNaN(n) ? null : n;
}

/** Normalize a v1 vehicle_idle_rollup to the record shape expected by sync */
function normalizeV1Rollup(raw: MotiveVehicleUtilizationV1Rollup): MotiveVehicleUtilizationRecord | null {
  const vehicle = raw.vehicle;
  if (!vehicle || vehicle.id == null) return null;
  const idleFuel = toNumber(raw.idle_fuel);
  const drivingFuel = toNumber(raw.driving_fuel);
  const totalFuel = raw.total_fuel != null ? toNumber(raw.total_fuel) : (idleFuel != null && drivingFuel != null ? idleFuel + drivingFuel : null);
  return {
    vehicle: {
      id: vehicle.id,
      number: vehicle.number,
      vin: vehicle.vin,
    },
    last_located_at: raw.last_located_at ?? null,
    utilization: toNumber(raw.utilization),
    idle_time: raw.idle_time ?? null,
    idle_fuel: idleFuel,
    driving_time: raw.driving_time ?? null,
    driving_fuel: drivingFuel,
    total_fuel: totalFuel,
    total_distance: raw.total_distance != null ? toNumber(raw.total_distance) : null,
    message: raw.message ?? null,
  };
}

export async function fetchVehicleUtilization(
  client: MotiveClient,
  date: string, // YYYY-MM-DD (Eastern calendar day)
  vehicleIds?: number[]
): Promise<MotiveVehicleUtilizationRecord[]> {
  const params: Record<string, any> = {
    start_date: date,
    end_date: date,
  };
  if (vehicleIds && vehicleIds.length > 0) {
    params.vehicle_ids = vehicleIds.join(',');
  }

  try {
    const rawList = await client.get<MotiveVehicleUtilizationV1Rollup>(
      '/v1/vehicle_utilization',
      params
    );
    const results: MotiveVehicleUtilizationRecord[] = [];
    for (const raw of rawList) {
      const normalized = normalizeV1Rollup(raw);
      if (normalized) results.push(normalized);
    }
    console.log(`✓ Fetched ${results.length} vehicle utilization records for ${date} (v1)`);
    return results;
  } catch (error) {
    console.error(`✗ Failed to fetch vehicle utilization for ${date}:`, error);
    throw error;
  }
}

