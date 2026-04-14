/**
 * MOTIVE API TYPES
 * TypeScript interfaces for Motive API responses
 */

// =====================================================
// VEHICLE UTILIZATION
// =====================================================
/** Normalized record shape used by sync (same for v1 and v2) */
export interface MotiveVehicleUtilizationRecord {
  vehicle: {
    id: number;
    number?: string;
    vin?: string;
  };
  last_located_at?: string | null;
  utilization?: number | null;
  idle_time?: number | null;
  idle_fuel?: number | null;
  driving_time?: number | null;
  driving_fuel?: number | null;
  total_fuel?: number | null;
  total_distance?: number | null;
  message?: string | null;
}

/** v2 response (legacy; we now use v1) */
export interface MotiveVehicleUtilizationResponse {
  results: MotiveVehicleUtilizationRecord[];
  pagination?: {
    page: number;
    per_page: number;
    total: number;
  };
}

/** v1 API returns vehicle_idle_rollups; items may be nested as vehicle_idle_rollup */
export interface MotiveVehicleUtilizationV1Rollup {
  vehicle?: {
    id: number;
    number?: string;
    vin?: string;
  };
  utilization?: number | string;
  idle_time?: number;
  idle_fuel?: number | string;
  driving_time?: number;
  driving_fuel?: number | string;
  total_fuel?: number | string;
  total_distance?: number | string;
  last_located_at?: string;
  message?: string;
}

// =====================================================
// DRIVER UTILIZATION
// =====================================================
export interface MotiveDriverUtilizationResponse {
  driver_idle_rollups: Array<{
    driver_idle_rollup: {
      driver: {
        id: number;
        first_name?: string;
        last_name?: string;
        username?: string;
        email?: string;
      } | null;
      utilization?: number; // Percentage
      idle_time?: number; // seconds
      driving_time?: number; // seconds
      idle_fuel?: number; // gallons
      driving_fuel?: number; // gallons
    };
  }>;
  pagination?: {
    page_no: number;
    per_page: number;
    total: number;
  };
}

// =====================================================
// IDLE EVENTS
// =====================================================
export interface MotiveIdleEventsResponse {
  idle_events: Array<{
    idle_event: {
      id: number;
      driver: {
        id: number;
        first_name?: string;
        last_name?: string;
        username?: string;
        email?: string;
      } | null;
      vehicle: {
        id: number;
        number?: string;
        vin?: string;
      };
      start_time: string; // ISO 8601
      end_time: string; // ISO 8601
      veh_fuel_start?: number; // milliliters
      veh_fuel_end?: number; // milliliters
      lat?: number;
      lon?: number;
      city?: string;
      state?: string;
      location?: string;
      rg_brg?: number; // Road bearing
      rg_km?: number; // Road distance
      rg_match?: boolean;
      end_type?: string;
      eld_device_id?: number;
      eld_identifier?: string;
    };
  }>;
  pagination?: {
    page_no: number;
    per_page: number;
    total: number;
  };
}

// =====================================================
// DRIVING PERIODS
// =====================================================
export interface MotiveDrivingPeriodsResponse {
  driving_periods: Array<{
    driving_period: {
      id: number;
      driver: {
        id: number;
        first_name?: string;
        last_name?: string;
        username?: string;
        email?: string;
        driver_company_id?: string;
        status?: string;
        role?: string;
      } | null;
      vehicle: {
        id: number;
        number?: string;
        vin?: string;
      };
      start_time: string; // ISO 8601
      end_time?: string; // ISO 8601 (null if in_progress)
      duration?: number; // seconds
      status?: string; // "in_progress", "complete", "interrupted"
      type?: string; // "driving", "PC", "YM"
      annotation_status?: number | null;
      notes?: string | null;
      source?: number;
      start_kilometers?: number;
      end_kilometers?: number;
      distance?: string;
      origin?: string;
      origin_lat?: number;
      origin_lon?: number;
      destination?: string;
      destination_lat?: number;
      destination_lon?: number;
      start_hvb_state_of_charge?: number;
      end_hvb_state_of_charge?: number;
      start_hvb_lifetime_energy_output?: number;
      end_hvb_lifetime_energy_output?: number;
    };
  }>;
  pagination?: {
    page_no: number;
    per_page: number;
    total: number;
  };
}

// =====================================================
// GEOFENCES
// =====================================================
export interface MotiveGeofencesResponse {
  geofences: Array<{
    geofence: {
      id: number;
      name: string;
      status: string; // "active", "deactivated"
      address?: string;
      description?: string;
      category?: string;
      location_points: Array<{
        lat: number;
        lon: number;
      }>;
    };
  }>;
  pagination?: {
    page_no: number;
    per_page: number;
    total: number;
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
  /** When true, this step was not counted as a hard failure (e.g. 401 due to token scope). */
  skipped?: boolean;
  skipReason?: string;
}

// =====================================================
// DATE HELPERS (shared - re-export from telematics/dates)
// =====================================================
export { getYesterday, getTwoDaysAgo, getDateRange } from '../dates.js';
