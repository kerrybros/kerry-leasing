/**
 * TELEMATICS TYPES
 * 
 * Normalized types for telematics data from multiple providers
 * All dates are in YYYY-MM-DD format
 * All distances in miles, fuel in gallons, time in minutes
 */

export enum TelematicsProvider {
  SAMSARA = 'SAMSARA',
  MOTIVE = 'MOTIVE',
}

export enum TelematicsProviderStatus {
  ACTIVE = 'ACTIVE',
  ERROR = 'ERROR',
  DISABLED = 'DISABLED',
}

/**
 * Provider vehicle info (from provider API)
 */
export interface ProviderVehicle {
  providerVehicleId: string;
  vin?: string; // May be null/missing from provider
  name?: string;
  externalId?: string;
}

/**
 * Normalized daily metrics (target format)
 */
export interface DailyMetric {
  vin: string;
  date: string; // YYYY-MM-DD
  milesDriven?: number;
  idleMinutes?: number;
  fuelGallons?: number;
  avgMpg?: number;
  engineHours?: number;
}

/**
 * Provider credentials (stored in credentialsJson)
 */
export interface SamsaraCredentials {
  apiToken: string;
}

export interface MotiveCredentials {
  apiKey: string;
}

export type ProviderCredentials = SamsaraCredentials | MotiveCredentials;

/**
 * Sync result for a single org
 */
export interface SyncResult {
  clerkOrgId: string;
  provider: TelematicsProvider;
  date: string;
  success: boolean;
  metricsCount: number;
  error?: string;
}
