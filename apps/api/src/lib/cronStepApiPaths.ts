/**
 * HTTP routes each cron "step" aggregates (for admin cron run reports).
 * Keep in sync with telematics sync implementations.
 */

import { CronJobType } from '../generated/app-client/index.js';

const SAMSARA = 'https://api.samsara.com';
const MOTIVE = 'https://api.gomotive.com';

const SAMSARA_DAILY_PATHS: Record<string, string[]> = {
  vehicles_roster: [`GET ${SAMSARA}/fleet/vehicles`],
  fuel_energy: [
    `GET ${SAMSARA}/fleet/reports/vehicles/fuel-energy`,
    `GET ${SAMSARA}/idling/events`,
  ],
  vehicle_stats: [`GET ${SAMSARA}/fleet/vehicles/stats`],
  safety_events: [`GET ${SAMSARA}/fleet/safety-events`],
};

const MOTIVE_DAILY_PATHS: Record<string, string[]> = {
  vehicle_utilization: [`GET ${MOTIVE}/v2/vehicle_utilization`],
  driver_utilization: [`GET ${MOTIVE}/v2/driver_utilization`],
  idle_events: [`GET ${MOTIVE}/v1/idle_events`],
  driving_periods: [`GET ${MOTIVE}/v1/driving_periods`],
  scorecard: [`GET ${MOTIVE}/v1/scorecard_summary`],
  geofences: [`GET ${MOTIVE}/v1/geofences`],
};

export function cronStepApiPaths(job: CronJobType, stepKey: string): string[] {
  const map =
    job === CronJobType.SAMSARA_DAILY
      ? SAMSARA_DAILY_PATHS
      : job === CronJobType.MOTIVE_DAILY
        ? MOTIVE_DAILY_PATHS
        : null;
  if (!map) return [];
  return map[stepKey] ?? [];
}
