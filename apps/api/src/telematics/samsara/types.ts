/**
 * SAMSARA API TYPES
 * TypeScript interfaces for Samsara API responses
 */

// =====================================================
// VEHICLE STATS
// =====================================================
export interface SamsaraVehicleStatsResponse {
  data: Array<{
    id: string; // Vehicle ID
    name?: string;
    time: string; // ISO 8601 timestamp
    obdOdometerMeters?: {
      value: number;
      time: string;
    };
    fuelPercents?: {
      value: number;
      time: string;
    };
    obdEngineSecondsMilliseconds?: {
      value: number;
      time: string;
    };
    gps?: {
      latitude: number;
      longitude: number;
      time: string;
      speedMilesPerHour?: number;
      headingDegrees?: number;
    }[];
  }>;
  pagination?: {
    hasNextPage: boolean;
    endCursor?: string;
  };
}

// =====================================================
// VEHICLES
// =====================================================
export interface SamsaraVehicle {
  id: string;
  name?: string;
  vin?: string;
  make?: string;
  model?: string;
  year?: string;
  licensePlate?: string;
  externalIds?: Record<string, string>;
  tags?: Array<{
    id: string;
    name: string;
  }>;
}

export interface SamsaraVehiclesResponse {
  data: SamsaraVehicle[];
  pagination?: {
    hasNextPage: boolean;
    endCursor?: string;
  };
}

// =====================================================
// SYNC RESULT TRACKING
// =====================================================
export interface SyncResult {
  endpoint: string;
  date: string;
  recordCount: number;
  newCount: number;
  updatedCount: number;
  unchangedCount: number;
  errorCount: number;
  errors: Array<{
    recordId: string | number;
    error: string;
  }>;
}

// =====================================================
// DATE HELPERS (shared - re-export from telematics/dates)
// =====================================================
export { getYesterday, getTwoDaysAgo, getDateRange } from '../dates.js';
