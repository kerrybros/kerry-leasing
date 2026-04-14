/**
 * Driver score computation — weighted composite of efficiency, behavior, and safety metrics.
 *
 * Score range: 0–100
 *
 * Category weights:
 *   Idle %         → 30%  (lower idle = better fuel savings)
 *   MPG efficiency → 25%  (relative to fleet average)
 *   Utilization    → 15%  (drive time / total engine time)
 *   Fuel economy   → 10%  (driving fuel as share of total — lower idle fuel share)
 *   Safety         → 20%  (fewer violations = higher score)
 */

export interface DriverScoreInput {
  idlePct: number;
  mpg: number;
  fleetAvgMpg?: number;
  driveTimePct?: number;
  drivingFuelRatio?: number;
  safetyViolations?: number;
}

export const SCORE_WEIGHTS = {
  idle: 0.30,
  mpg: 0.25,
  utilization: 0.15,
  fuelEconomy: 0.10,
  safety: 0.20,
} as const;

const MAX_SCOREABLE_IDLE_PCT = 50;
const SAFETY_DECAY_RATE = 12;

export function computeDriverScore(metrics: DriverScoreInput): number {
  // Idle sub-score: 100 at 0% idle, 0 at MAX_SCOREABLE_IDLE_PCT or above
  const idleScore = Math.max(0, Math.min(100, (1 - metrics.idlePct / MAX_SCOREABLE_IDLE_PCT) * 100));

  // MPG sub-score: fleet average earns 60/100; scaled linearly
  const refMpg = metrics.fleetAvgMpg && metrics.fleetAvgMpg > 0 ? metrics.fleetAvgMpg : metrics.mpg || 1;
  const mpgScore = Math.max(0, Math.min(100, (metrics.mpg / refMpg) * 60));

  // Utilization sub-score: % of engine-on time spent driving (100% drive = 100 score)
  const driveTimePct = metrics.driveTimePct ?? (100 - metrics.idlePct);
  const utilizationScore = Math.max(0, Math.min(100, driveTimePct));

  // Fuel economy sub-score: driving fuel / total fuel ratio (1.0 = no idle fuel burn)
  const fuelRatio = metrics.drivingFuelRatio ?? 1;
  const fuelEconomyScore = Math.max(0, Math.min(100, fuelRatio * 100));

  // Safety sub-score: exponential decay per violation (0 violations = 100)
  const violations = metrics.safetyViolations ?? 0;
  const safetyScore = Math.max(0, 100 * Math.exp(-violations / SAFETY_DECAY_RATE));

  return Math.round(
    idleScore * SCORE_WEIGHTS.idle +
    mpgScore * SCORE_WEIGHTS.mpg +
    utilizationScore * SCORE_WEIGHTS.utilization +
    fuelEconomyScore * SCORE_WEIGHTS.fuelEconomy +
    safetyScore * SCORE_WEIGHTS.safety
  );
}

export function scoreVariant(score: number): 'success' | 'warning' | 'destructive' {
  if (score >= 75) return 'success';
  if (score >= 55) return 'warning';
  return 'destructive';
}

export function scoreLabel(score: number): string {
  if (score >= 90) return 'Excellent';
  if (score >= 75) return 'Good';
  if (score >= 55) return 'Fair';
  if (score >= 35) return 'Needs Work';
  return 'Poor';
}
