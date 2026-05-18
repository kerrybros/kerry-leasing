/**
 * Driver score — 3-lever, cost-led composite.
 *
 * Score range: 0–100
 *
 * Category weights:
 *   Idle %   → 40%  (lower idle = less wasted fuel/$ — also absorbs the old
 *                     "fuel economy" metric, which was a duplicate idle signal)
 *   MPG      → 35%  (efficiency relative to fleet average)
 *   Safety   → 25%  (per-mile, Motive-weighted event rate — computed backend-side
 *                     in safetyScore.ts; passed in here as a 0–100 sub-score)
 *
 * Utilization was removed. Safety is NOT computed here: the per-mile weighted
 * rate needs the raw event stream, so the backend supplies `safetyScore`.
 */

export interface DriverScoreInput {
  idlePct: number;
  mpg: number;
  fleetAvgMpg?: number;
  /** Backend per-mile safety sub-score (0–100). Absent → 100 (no penalty). */
  safetyScore?: number;
}

export const SCORE_WEIGHTS = {
  idle: 0.40,
  mpg: 0.35,
  safety: 0.25,
} as const;

const MAX_SCOREABLE_IDLE_PCT = 50;

export function computeDriverScore(metrics: DriverScoreInput): number {
  // Idle sub-score: 100 at 0% idle, 0 at MAX_SCOREABLE_IDLE_PCT or above
  const idleScore = Math.max(0, Math.min(100, (1 - metrics.idlePct / MAX_SCOREABLE_IDLE_PCT) * 100));

  // MPG sub-score: fleet average earns 60/100; scaled linearly
  const refMpg = metrics.fleetAvgMpg && metrics.fleetAvgMpg > 0 ? metrics.fleetAvgMpg : metrics.mpg || 1;
  const mpgScore = Math.max(0, Math.min(100, (metrics.mpg / refMpg) * 60));

  // Safety sub-score: precomputed backend-side (per-mile, Motive-weighted).
  // No data → 100 (a driver with no scored events is not penalized).
  const safetyScore = Math.max(0, Math.min(100, metrics.safetyScore ?? 100));

  return Math.round(
    idleScore * SCORE_WEIGHTS.idle +
    mpgScore * SCORE_WEIGHTS.mpg +
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
