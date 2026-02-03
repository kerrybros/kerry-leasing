/**
 * SAMSARA TELEMATICS ADAPTER
 * 
 * Implements telematics provider interface for Samsara
 * API Docs: https://developers.samsara.com/
 * 
 * Stores raw data in Samsara-specific table with typed schema
 * Normalization:
 * - Miles: from odometer delta (meters -> miles)
 * - Idle: from idlingDuration delta (ms -> minutes)
 * - Fuel: from fuelConsumed delta (ml -> gallons)
 * - MPG: calculated when both miles and fuel available
 */

import axios, { AxiosInstance } from 'axios';
import type { ITelematicsProvider, RawDailyMetric } from './IProvider.js';
import type { ProviderVehicle, DailyMetric, SamsaraCredentials } from '../types.js';

const SAMSARA_API_BASE = 'https://api.samsara.com';
const METERS_TO_MILES = 0.000621371;
const ML_TO_GALLONS = 0.000264172;
const MS_TO_MINUTES = 1 / 60000;

interface SamsaraVehicle {
  id: string;
  name?: string;
  vin?: string;
  externalIds?: Record<string, string>;
}

interface SamsaraStat {
  vehicleId: string;
  time: string;
  odometerMeters?: number;
  fuelConsumedMilliliters?: number;
  idlingDurationMilliseconds?: number;
  engineHoursMilliseconds?: number;
}

// Samsara-specific raw data structure
export interface SamsaraRawDataStructure {
  vehicleId: string;
  vin: string | null;
  vehicleName: string | null;
  date: string;
  startTime: string;
  endTime: string;
  odometerStart: number | null;
  odometerEnd: number | null;
  fuelConsumedStart: number | null;
  fuelConsumedEnd: number | null;
  idleDurationStart: number | null;
  idleDurationEnd: number | null;
  engineHoursStart: number | null;
  engineHoursEnd: number | null;
  rawResponse: any; // Full API response for reference
}

export class SamsaraProvider implements ITelematicsProvider {
  private client: AxiosInstance;

  constructor(credentials: SamsaraCredentials) {
    this.client = axios.create({
      baseURL: SAMSARA_API_BASE,
      headers: {
        'Authorization': `Bearer ${credentials.apiToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
  }

  async listVehicles(): Promise<ProviderVehicle[]> {
    try {
      const response = await this.client.get('/fleet/vehicles', {
        params: {
          limit: 512, // Max per Samsara docs
        },
      });

      const vehicles: SamsaraVehicle[] = response.data.data || [];
      
      return vehicles.map(v => ({
        providerVehicleId: v.id,
        vin: v.vin,
        name: v.name,
        externalId: v.externalIds?.['default'],
      }));
    } catch (error) {
      console.error('Samsara listVehicles error:', error);
      throw new Error(`Failed to list Samsara vehicles: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async fetchDailyMetricsForDate(date: string): Promise<RawDailyMetric[]> {
    try {
      // Date range: Start of day to end of day in UTC
      // Samsara expects ISO 8601 timestamps
      const startTime = `${date}T00:00:00Z`;
      const endTime = `${date}T23:59:59Z`;

      // Fetch vehicle stats for the entire day
      const response = await this.client.get('/fleet/vehicles/stats/history', {
        params: {
          types: 'obdOdometerMeters,fuelConsumedMilliliters,obdEngineSecondsMilliseconds,idlingDurationMilliseconds',
          startTime,
          endTime,
          limit: 1000,
        },
      });

      const stats: SamsaraStat[] = response.data.data || [];
      
      // Group by vehicle ID
      const vehicleStats = this.groupStatsByVehicle(stats);
      
      // Get vehicle info (for VINs)
      const vehicles = await this.listVehicles();
      const vehicleMap = new Map(vehicles.map(v => [v.providerVehicleId, v]));
      
      // Calculate daily metrics per vehicle with Samsara-specific raw data
      const results: RawDailyMetric[] = [];
      
      for (const [vehicleId, vehicleData] of vehicleStats.entries()) {
        const vehicle = vehicleMap.get(vehicleId);
        if (!vehicle) {
          console.warn(`Samsara vehicle ${vehicleId} not found in vehicle list, skipping`);
          continue;
        }

        const firstStat = vehicleData[0];
        const lastStat = vehicleData[vehicleData.length - 1];

        // Create Samsara-specific structured data
        const samsaraRawData: SamsaraRawDataStructure = {
          vehicleId,
          vin: vehicle.vin || null,
          vehicleName: vehicle.name || null,
          date,
          startTime,
          endTime,
          odometerStart: firstStat.odometerMeters || null,
          odometerEnd: lastStat.odometerMeters || null,
          fuelConsumedStart: firstStat.fuelConsumedMilliliters || null,
          fuelConsumedEnd: lastStat.fuelConsumedMilliliters || null,
          idleDurationStart: firstStat.idlingDurationMilliseconds || null,
          idleDurationEnd: lastStat.idlingDurationMilliseconds || null,
          engineHoursStart: firstStat.engineHoursMilliseconds || null,
          engineHoursEnd: lastStat.engineHoursMilliseconds || null,
          rawResponse: {
            vehicle,
            stats: vehicleData,
            apiResponse: response.data,
          },
        };

        const dailyMetric = this.calculateDailyDelta(vehicleData, vehicle.vin || '', date);
        if (dailyMetric) {
          results.push({
            providerVehicleId: vehicleId,
            date,
            rawResponse: samsaraRawData,
            normalized: dailyMetric,
          });
        }
      }

      return results;
    } catch (error) {
      console.error('Samsara fetchDailyMetricsForDate error:', error);
      throw new Error(`Failed to fetch Samsara metrics: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Group stats by vehicle ID and sort by time
   */
  private groupStatsByVehicle(stats: SamsaraStat[]): Map<string, SamsaraStat[]> {
    const grouped = new Map<string, SamsaraStat[]>();
    
    for (const stat of stats) {
      if (!grouped.has(stat.vehicleId)) {
        grouped.set(stat.vehicleId, []);
      }
      grouped.get(stat.vehicleId)!.push(stat);
    }

    // Sort each vehicle's stats by time
    for (const [vehicleId, vehicleStats] of grouped.entries()) {
      vehicleStats.sort((a, b) => 
        new Date(a.time).getTime() - new Date(b.time).getTime()
      );
    }

    return grouped;
  }

  /**
   * Calculate daily deltas from start to end of day
   */
  private calculateDailyDelta(stats: SamsaraStat[], vin: string, date: string): DailyMetric | null {
    if (stats.length === 0) return null;

    const firstStat = stats[0];
    const lastStat = stats[stats.length - 1];

    const metric: DailyMetric = {
      vin,
      date,
    };

    // Miles driven (odometer delta)
    if (lastStat.odometerMeters != null && firstStat.odometerMeters != null) {
      const deltaMeters = lastStat.odometerMeters - firstStat.odometerMeters;
      metric.milesDriven = deltaMeters * METERS_TO_MILES;
    }

    // Idle minutes (idle duration delta)
    if (lastStat.idlingDurationMilliseconds != null && firstStat.idlingDurationMilliseconds != null) {
      const deltaMs = lastStat.idlingDurationMilliseconds - firstStat.idlingDurationMilliseconds;
      metric.idleMinutes = deltaMs * MS_TO_MINUTES;
    }

    // Fuel gallons (fuel consumed delta)
    if (lastStat.fuelConsumedMilliliters != null && firstStat.fuelConsumedMilliliters != null) {
      const deltaMl = lastStat.fuelConsumedMilliliters - firstStat.fuelConsumedMilliliters;
      metric.fuelGallons = deltaMl * ML_TO_GALLONS;
    }

    // Engine hours (engine seconds delta)
    if (lastStat.engineHoursMilliseconds != null && firstStat.engineHoursMilliseconds != null) {
      const deltaMs = lastStat.engineHoursMilliseconds - firstStat.engineHoursMilliseconds;
      metric.engineHours = deltaMs / (1000 * 60 * 60); // ms to hours
    }

    // Calculate MPG if we have both miles and fuel
    if (metric.milesDriven != null && metric.fuelGallons != null && metric.fuelGallons > 0) {
      metric.avgMpg = metric.milesDriven / metric.fuelGallons;
    }

    // Return null if no meaningful data
    if (metric.milesDriven == null && metric.idleMinutes == null && metric.fuelGallons == null) {
      return null;
    }

    return metric;
  }
}
