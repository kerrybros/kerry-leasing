/**
 * FETCH DRIVER FUEL-ENERGY REPORTS
 *
 * Endpoint: GET /fleet/reports/drivers/fuel-energy
 * Returns per-driver distance/fuel/idle/run time AGGREGATED across the date range.
 * To get per-day rows we call it with startDate=endDate=date (mirrors what we already
 * do for /fleet/reports/vehicles/fuel-energy).
 *
 * Token scope: "Read Fuel & Energy".
 */

import { SamsaraClient } from '../client.js';
import { getESTDateString } from '../../dates.js';

export interface SamsaraDriverFuelEnergyReport {
  driver: {
    id: string;
    name?: string;
    externalIds?: Record<string, string>;
  };
  distanceTraveledMeters: number;
  efficiencyMpge?: number | null;
  energyUsedKwh?: number | null;
  fuelConsumedMl?: number | null;
  engineRunTimeDurationMs?: number | null;
  engineIdleTimeDurationMs?: number | null;
  estCarbonEmissionsKg?: number | null;
  estFuelEnergyCost?: { amount: number; currencyCode: string } | null;
}

interface DriverFuelEnergyResponseShape {
  data?: { driverReports?: SamsaraDriverFuelEnergyReport[] };
  pagination?: { hasNextPage?: boolean; endCursor?: string };
}

/**
 * Fetch driver fuel-energy reports for a single calendar day (EST).
 */
export async function fetchDriverFuelEnergyReports(
  client: SamsaraClient,
  date: string
): Promise<SamsaraDriverFuelEnergyReport[]> {
  const estDateStr = getESTDateString(date);

  let allReports: SamsaraDriverFuelEnergyReport[] = [];
  let cursor: string | undefined;
  let hasMore = true;

  while (hasMore) {
    const params: Record<string, any> = {
      startDate: estDateStr,
      endDate: estDateStr,
    };
    if (cursor) params.after = cursor;

    const response = await client.getSinglePage<DriverFuelEnergyResponseShape>(
      '/fleet/reports/drivers/fuel-energy',
      params
    ) as DriverFuelEnergyResponseShape;

    const page = response.data?.driverReports ?? [];
    allReports = allReports.concat(page);

    hasMore = response.pagination?.hasNextPage === true;
    cursor = response.pagination?.endCursor;
  }

  return allReports;
}
