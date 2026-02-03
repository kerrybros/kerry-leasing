/**
 * MOTIVE TELEMATICS ADAPTER
 * 
 * Implements telematics provider interface for Motive (formerly KeepTruckin)
 * API Docs: https://gomotive.com/developer
 * 
 * Stores raw data in Motive-specific table with typed schema
 * Normalization:
 * - Miles: from IFTA mileage summary or odometer readings
 * - Idle: from vehicle utilization API (if available)
 * - Fuel: Limited availability in v1, attempt to get from fuel usage endpoints
 */

import axios, { AxiosInstance } from 'axios';
import type { ITelematicsProvider, RawDailyMetric } from './IProvider.js';
import type { ProviderVehicle, DailyMetric, MotiveCredentials } from '../types.js';

const MOTIVE_API_BASE = 'https://api.gomotive.com';

interface MotiveVehicle {
  id: string;
  number?: string;
  vin?: string;
  year?: number;
  make?: string;
  model?: string;
}

interface MotiveIFTASummary {
  vehicle: {
    id: string;
  };
  total_distance_miles: number;
  start_date: string;
  end_date: string;
}

interface MotiveUtilization {
  vehicle_id: string;
  date: string;
  total_engine_hours_duration?: number; // seconds
  total_idle_duration?: number; // seconds
  total_driving_duration?: number; // seconds
}

// Motive-specific raw data structure
export interface MotiveRawDataStructure {
  vehicleId: string;
  vin: string | null;
  vehicleNumber: string | null;
  vehicleName: string | null;
  date: string;
  iftaTotalMiles: number | null;
  iftaStartDate: string | null;
  iftaEndDate: string | null;
  totalEngineDuration: number | null;
  totalIdleDuration: number | null;
  totalDrivingDuration: number | null;
  iftaRawResponse: any;
  utilizationRawResponse: any;
}

export class MotiveProvider implements ITelematicsProvider {
  private client: AxiosInstance;

  constructor(credentials: MotiveCredentials) {
    this.client = axios.create({
      baseURL: MOTIVE_API_BASE,
      headers: {
        'Authorization': `Bearer ${credentials.apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
  }

  async listVehicles(): Promise<ProviderVehicle[]> {
    try {
      let allVehicles: MotiveVehicle[] = [];
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const response = await this.client.get('/v1/vehicles', {
          params: {
            page,
            per_page: 100,
          },
        });

        const vehicles: MotiveVehicle[] = response.data.vehicles || [];
        allVehicles = allVehicles.concat(vehicles);

        // Check pagination
        const pagination = response.data.pagination;
        hasMore = pagination && pagination.page < pagination.total_pages;
        page++;
      }

      return allVehicles.map(v => ({
        providerVehicleId: v.id,
        vin: v.vin,
        name: v.number || `${v.year} ${v.make} ${v.model}`.trim(),
      }));
    } catch (error) {
      console.error('Motive listVehicles error:', error);
      throw new Error(`Failed to list Motive vehicles: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async fetchDailyMetricsForDate(date: string): Promise<RawDailyMetric[]> {
    try {
      // Get vehicles first for VIN mapping
      const vehicles = await this.listVehicles();
      const vehicleMap = new Map(vehicles.map(v => [v.providerVehicleId, v]));

      // Fetch IFTA mileage data
      const mileageData = await this.fetchIFTAMileage(date);
      
      // Fetch utilization data (idle/engine hours)
      const utilizationData = await this.fetchUtilization(date);

      // Combine data with Motive-specific structured raw data
      const results: RawDailyMetric[] = [];

      for (const mileage of mileageData) {
        const vehicleId = mileage.vehicle.id;
        const vehicle = vehicleMap.get(vehicleId);
        
        if (!vehicle) {
          console.warn(`Motive vehicle ${vehicleId} not found, skipping`);
          continue;
        }

        const utilization = utilizationData.find(u => u.vehicle_id === vehicleId);

        // Create Motive-specific structured data
        const motiveRawData: MotiveRawDataStructure = {
          vehicleId,
          vin: vehicle.vin || null,
          vehicleNumber: (vehicle as any).number || null,
          vehicleName: vehicle.name || null,
          date,
          iftaTotalMiles: mileage.total_distance_miles || null,
          iftaStartDate: mileage.start_date || null,
          iftaEndDate: mileage.end_date || null,
          totalEngineDuration: utilization?.total_engine_hours_duration || null,
          totalIdleDuration: utilization?.total_idle_duration || null,
          totalDrivingDuration: utilization?.total_driving_duration || null,
          iftaRawResponse: mileage,
          utilizationRawResponse: utilization || null,
        };

        const metric: DailyMetric = {
          vin: vehicle.vin || '',
          date,
          milesDriven: mileage.total_distance_miles,
        };

        // Add utilization data if available
        if (utilization) {
          if (utilization.total_idle_duration != null) {
            metric.idleMinutes = utilization.total_idle_duration / 60; // seconds to minutes
          }
          if (utilization.total_engine_hours_duration != null) {
            metric.engineHours = utilization.total_engine_hours_duration / 3600; // seconds to hours
          }
        }

        results.push({
          providerVehicleId: vehicleId,
          date,
          rawResponse: motiveRawData,
          normalized: metric,
        });
      }

      return results;
    } catch (error) {
      console.error('Motive fetchDailyMetricsForDate error:', error);
      throw new Error(`Failed to fetch Motive metrics: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Fetch IFTA mileage summary for a single date
   */
  private async fetchIFTAMileage(date: string): Promise<MotiveIFTASummary[]> {
    try {
      const response = await this.client.get('/v1/ifta/summary', {
        params: {
          start_date: date,
          end_date: date,
          per_page: 100,
        },
      });

      return response.data.summaries || [];
    } catch (error) {
      console.error('Motive IFTA mileage error:', error);
      // Return empty array if IFTA not available
      return [];
    }
  }

  /**
   * Fetch vehicle utilization for idle and engine hours
   */
  private async fetchUtilization(date: string): Promise<MotiveUtilization[]> {
    try {
      // Note: Motive v2 vehicle utilization endpoint
      const response = await this.client.get('/v2/vehicle_utilizations', {
        params: {
          start_date: date,
          end_date: date,
          per_page: 100,
        },
      });

      return response.data.vehicle_utilizations || [];
    } catch (error) {
      console.error('Motive utilization error:', error);
      // Return empty array if utilization not available
      return [];
    }
  }
}
