/**
 * TELEMATICS INTERFACES
 *
 * Shared normalized types and the ITelematicsProvider contract.
 *
 * Every telematics provider (Motive, Samsara, future) implements
 * ITelematicsProvider. The normalization service and API routes
 * consume these types exclusively — never provider-specific shapes.
 *
 * Unit standards (enforced at the transform layer, not in the DB):
 *   - Time (API output): seconds  — aggregation layer divides by 60 for display
 *   - Distance: miles
 *   - Fuel:     gallons (US)
 *   - Dates:    YYYY-MM-DD strings (local calendar day)
 *   - Timestamps: ISO 8601 / RFC 3339
 */

// ---------------------------------------------------------------------------
// Normalized read types (returned by API routes to the frontend)
// ---------------------------------------------------------------------------

export interface NormalizedVehicleRecord {
  vehicleId: number;
  vehicleNumber: string | null;
  vin: string | null;
  date: string;              // YYYY-MM-DD
  totalDistance: number | null;  // miles
  idleTime: number | null;       // seconds
  drivingTime: number | null;    // seconds
  totalFuel: number | null;      // gallons
  idleFuel: number | null;       // gallons
  drivingFuel: number | null;    // gallons
}

export interface NormalizedVehicleResponse {
  data: NormalizedVehicleRecord[];
  provider: 'MOTIVE' | 'SAMSARA';
}

export interface NormalizedDriverRecord {
  driverId: number;
  driverFirstName: string | null;
  driverLastName: string | null;
  date: string;              // YYYY-MM-DD
  utilization: number | null;    // 0–100 percentage
  drivingTime: number | null;    // seconds
  idleTime: number | null;       // seconds
  drivingFuel: number | null;    // gallons
  idleFuel: number | null;       // gallons
  totalDistance: number | null;  // miles
}

export interface NormalizedDriverResponse {
  data: NormalizedDriverRecord[];
  provider: 'MOTIVE' | 'SAMSARA';
}

export interface NormalizedIdlingEvent {
  eventId: string | number;
  vehicleId: string | number;
  vehicleNumber: string | null;
  driverId: string | number | null;
  driverName: string | null;
  startTime: string;         // ISO 8601
  endTime: string | null;    // ISO 8601; derivable from startTime + duration if not present
  durationMinutes: number | null;
  fuelConsumedGallons: number | null;
  fuelCostUsd: number | null;    // calculated: fuelConsumedGallons * EIA diesel price
  latitude: number | null;
  longitude: number | null;
  city: string | null;
  state: string | null;
  formattedAddress: string | null;
  geofenceId: string | null;
  geofenceName: string | null;
}

export interface NormalizedSafetyEvent {
  eventId: string | number;
  vehicleId: string | number;
  driverId: string | number | null;
  driverName: string | null;
  /** Normalized event type label. Providers map their labels to these. */
  eventType:
    | 'hard_brake'
    | 'hard_accel'
    | 'hard_corner'
    | 'speeding'
    | 'crash'
    | 'mobile_usage'
    | 'lane_departure'
    | 'drowsy'
    | 'other';
  occurredAt: string;        // ISO 8601
  latitude: number | null;
  longitude: number | null;
  severity: string | null;
  coachingStatus: string | null;
}

// ---------------------------------------------------------------------------
// Shared sync result (identical shape used by both providers)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// ITelematicsProvider — the contract every provider must implement
//
// Sync methods write provider data to provider-specific DB tables.
// Read methods return normalized data from those tables for API routes.
//
// Optional methods (?) are implemented only when the provider supports
// that data type. Callers check for presence before invoking.
//
// To add a new provider:
//   1. Create apps/api/src/telematics/providers/<name>/
//   2. Implement this interface in index.ts
//   3. Register it in telematics/registry/providerRegistry.ts
//   See TELEMATICS_ARCHITECTURE.md for the full walkthrough.
// ---------------------------------------------------------------------------

export interface ITelematicsProvider {
  /** Provider identifier — matches TelematicsProvider enum value */
  readonly name: string;

  // --- Sync operations (called by daily cron) ---

  syncVehicleUtilization(
    orgId: string,
    apiCredential: string,
    date: string,
    verify?: boolean
  ): Promise<SyncResult>;

  syncDriverUtilization(
    orgId: string,
    apiCredential: string,
    date: string,
    verify?: boolean
  ): Promise<SyncResult>;

  syncIdlingEvents(
    orgId: string,
    apiCredential: string,
    date: string,
    verify?: boolean
  ): Promise<SyncResult>;

  syncVehicleRoster(
    orgId: string,
    apiCredential: string
  ): Promise<SyncResult>;

  /** Safety / harsh events — optional, implement when provider supports it */
  syncSafetyEvents?(
    orgId: string,
    apiCredential: string,
    date: string,
    verify?: boolean
  ): Promise<SyncResult>;

  /** OBD fault codes — optional, Motive-specific initially */
  syncFaultCodes?(
    orgId: string,
    apiCredential: string
  ): Promise<SyncResult>;

  /** Reefer / temperature trailer data — optional, Motive-specific initially */
  syncReeferActivity?(
    orgId: string,
    apiCredential: string,
    date: string
  ): Promise<SyncResult>;

  // --- Read operations (called by API routes via normalization service) ---

  getVehicleUtilization(
    orgId: string,
    startDate: string,
    endDate: string
  ): Promise<NormalizedVehicleRecord[]>;

  getDriverUtilization(
    orgId: string,
    startDate: string,
    endDate: string
  ): Promise<NormalizedDriverRecord[]>;

  getIdlingEvents(
    orgId: string,
    startDate: string,
    endDate: string
  ): Promise<NormalizedIdlingEvent[]>;
}
