/**
 * TELEMATICS PROVIDER INTERFACE
 * 
 * All provider adapters must implement this interface
 * to provide normalized telematics data AND raw source data
 */

import type { ProviderVehicle, DailyMetric } from '../types.js';

/**
 * Raw data result with both normalized and original response
 */
export interface RawDailyMetric {
  providerVehicleId: string;
  date: string;
  rawResponse: any; // Original API response
  normalized: DailyMetric; // Normalized metrics
}

export interface ITelematicsProvider {
  /**
   * List all vehicles from the provider
   * 
   * @returns Array of vehicles with provider IDs and optional VINs
   */
  listVehicles(): Promise<ProviderVehicle[]>;

  /**
   * Fetch daily metrics for a specific date
   * Returns both raw API responses and normalized data
   * 
   * @param date - Date in YYYY-MM-DD format
   * @returns Array of raw daily metrics with normalization
   */
  fetchDailyMetricsForDate(date: string): Promise<RawDailyMetric[]>;
}
