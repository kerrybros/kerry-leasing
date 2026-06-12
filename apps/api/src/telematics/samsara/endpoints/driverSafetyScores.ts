/**
 * FETCH DRIVER SAFETY SCORES
 *
 * Endpoint: GET /safety-scores/drivers
 * Returns per-driver overall safety score + behavior counts + speeding durations
 * AGGREGATED across the time range. We capture this only as a sanity-check /
 * reference number — our scorecard math computes its own safety sub-score from
 * the raw safety-event stream (mirroring the Motive approach).
 *
 * Token scope: "Read Safety Events & Scores".
 */

import { SamsaraClient } from '../client.js';
import { getESTDayBounds } from '../../dates.js';

export interface SamsaraDriverScoreBehavior {
  behaviorType: string;
  count?: number;
  scoreImpact?: number;
}

export interface SamsaraDriverScoreSpeeding {
  speedingType: string; // "light" | "moderate" | "heavy" | "severe" | "maxSpeed" | "unknown"
  durationMilliseconds?: number;
  scoreImpact?: number;
}

export interface SamsaraDriverSafetyScoreApi {
  driverId: string;
  driverScore?: number; // 0–100
  driveDistanceMeters?: number;
  driveTimeMilliseconds?: number;
  behaviors?: SamsaraDriverScoreBehavior[];
  speeding?: SamsaraDriverScoreSpeeding[];
}

/**
 * Fetch driver safety scores for a single calendar day (EST). Day boundary is
 * passed as startTime/endTime in RFC 3339 — the endpoint requires "at least 1
 * day before endTime" so this single-day call is the minimum legal window.
 */
export async function fetchDriverSafetyScores(
  client: SamsaraClient,
  date: string
): Promise<SamsaraDriverSafetyScoreApi[]> {
  const { startTime, endTime } = getESTDayBounds(date);
  return client.get<SamsaraDriverSafetyScoreApi>('/safety-scores/drivers', {
    startTime,
    endTime,
  });
}
