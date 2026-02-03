/**
 * MOTIVE API TYPES
 * TypeScript interfaces for Motive API responses
 */

// =====================================================
// VEHICLE UTILIZATION
// =====================================================
export interface MotiveVehicleUtilizationResponse {
  results: Array<{
    vehicle: {
      id: number;
      number?: string;
      vin?: string;
    };
    last_located_at?: string; // ISO 8601
    utilization?: number; // Percentage
    idle_time?: number; // seconds
    idle_fuel?: number; // gallons
    driving_time?: number; // seconds
    driving_fuel?: number; // gallons
    total_fuel?: number; // gallons
    total_distance?: number; // miles
    message?: string;
  }>;
  pagination?: {
    page: number;
    per_page: number;
    total: number;
  };
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
}

// =====================================================
// DATE HELPERS
// =====================================================
export function getYesterday(timezone: string = 'America/Toronto'): string {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  
  // Format as YYYY-MM-DD
  return yesterday.toISOString().split('T')[0];
}

export function getTwoDaysAgo(timezone: string = 'America/Toronto'): string {
  const now = new Date();
  const twoDaysAgo = new Date(now);
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
  
  // Format as YYYY-MM-DD
  return twoDaysAgo.toISOString().split('T')[0];
}

export function getDateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const current = new Date(startDate);
  const end = new Date(endDate);
  
  while (current <= end) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }
  
  return dates;
}
