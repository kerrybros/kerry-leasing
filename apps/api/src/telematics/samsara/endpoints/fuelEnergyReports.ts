/**
 * FETCH VEHICLE FUEL-ENERGY REPORTS
 * Fetches comprehensive vehicle fuel/energy data from Samsara for a date range
 * 
 * Endpoint: GET /fleet/reports/vehicles/fuel-energy
 * Provides: distance, fuel, engine hours, idle time, MPG, VIN, emissions, cost
 *
 * Date range: full calendar day in EST (America/New_York), not UTC.
 */

import { SamsaraClient } from '../client.js';
import { getESTDayBounds } from '../../dates.js';

export interface SamsaraVehicleReport {
  vehicle: {
    energyType: 'fuel' | 'electric';
    id: string;
    name: string;
    externalIds: {
      'samsara.serial': string;
      'samsara.vin': string;
    };
  };
  efficiencyMpge: number;
  energyUsedKwh: number;
  fuelConsumedMl: number;
  distanceTraveledMeters: number;
  estCarbonEmissionsKg: number;
  estFuelEnergyCost: {
    amount: number;
    currencyCode: string;
  };
  engineRunTimeDurationMs: number;
  engineIdleTimeDurationMs: number;
}

export interface SamsaraFuelEnergyResponse {
  data: {
    vehicleReports: SamsaraVehicleReport[];
  };
  pagination: {
    endCursor: string;
    hasNextPage: boolean;
  };
}

/**
 * Unit conversion utilities
 */
export const SamsaraConversions = {
  metersToMiles: (meters: number) => meters / 1609.34,
  millilitersToGallons: (ml: number) => ml / 3785.41,
  millisecondsToHours: (ms: number) => ms / 3600000,
  millisecondsToMinutes: (ms: number) => ms / 60000,
};

/**
 * Fetch fuel-energy data for all vehicles for a specific date
 * 
 * @param client - Samsara API client
 * @param date - Date in YYYY-MM-DD format
 * @param timezone - Timezone for date boundaries (default: America/Toronto)
 * @returns Array of vehicle reports with all metrics
 */
export async function fetchFuelEnergyReports(
  client: SamsaraClient,
  date: string
): Promise<SamsaraVehicleReport[]> {
  try {
    const { startTime, endTime } = getESTDayBounds(date);
    console.log(`[Samsara] Fetching fuel-energy for ${date} EST (${startTime} to ${endTime})`);

    // Fetch with pagination support
    let allReports: SamsaraVehicleReport[] = [];
    let cursor: string | undefined = undefined;
    let hasMore = true;

    while (hasMore) {
      const params: any = {
        startDate: startTime,
        endDate: endTime,
        energyType: 'fuel',
      };

      if (cursor) {
        params.after = cursor;
      }

      const response = await client.getSinglePage<any>(
        '/fleet/reports/vehicles/fuel-energy',
        params
      );

      // response is already the parsed data from axios
      if (response.data?.vehicleReports) {
        allReports = allReports.concat(response.data.vehicleReports);
      }

      // Check pagination
      hasMore = response.pagination?.hasNextPage || false;
      cursor = response.pagination?.endCursor;

      console.log(
        `[Samsara] Fetched ${response.data?.vehicleReports?.length || 0} vehicles, ` +
        `total: ${allReports.length}, hasMore: ${hasMore}`
      );
    }

    console.log(`[Samsara] Total vehicles fetched for ${date}: ${allReports.length}`);
    return allReports;
  } catch (error: any) {
    console.error(`[Samsara] fetchFuelEnergyReports error for ${date}:`, error);
    throw new Error(`Failed to fetch Samsara fuel-energy reports: ${error.message}`);
  }
}

/**
 * Helper: Get next day in YYYY-MM-DD format
 */
function getNextDay(date: string): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().split('T')[0];
}
