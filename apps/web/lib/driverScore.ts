/**
 * Driver score computation.
 * Weights and formula documented in DESIGN.md.
 *
 * Score range: 0–100
 * - Idle %  → 40% weight (lower is better)
 * - MPG     → 40% weight (relative to fleet average)
 * - Safety  → 20% weight (stubbed at full score until safety-event APIs are connected)
 */

export interface DriverSafetyEvents {
  speedingEvents?: number;      // stub — not yet available
  hardStops?: number;           // stub — not yet available
  stopSignViolations?: number;  // stub — not yet available
}

export const SCORE_WEIGHTS = {
  idle: 0.4,
  mpg: 0.4,
  safety: 0.2,
} as const;

// Idle % at which the idle sub-score reaches 0. Above this, clamp to 0.
const MAX_SCOREABLE_IDLE_PCT = 50;

/**
 * Compute a 0–100 driver score.
 *
 * @param metrics.idlePct   Idle percentage (0–100, e.g. 25 for 25%).
 * @param metrics.mpg       Driver MPG for the period.
 * @param metrics.fleetAvgMpg  Fleet-wide average MPG; used for relative scoring.
 *                             If absent, treats driver MPG as average.
 * @param safetyEvents      Optional safety event counts (stubbed).
 */
export function computeDriverScore(
  metrics: { idlePct: number; mpg: number; fleetAvgMpg?: number },
  safetyEvents?: DriverSafetyEvents
): number {
  // Idle sub-score: 100 at 0% idle, 0 at MAX_SCOREABLE_IDLE_PCT or above
  const idleScore = Math.max(
    0,
    Math.min(100, (1 - metrics.idlePct / MAX_SCOREABLE_IDLE_PCT) * 100)
  );

  // MPG sub-score: fleet average earns 60/100; scaled linearly above/below
  const refMpg = metrics.fleetAvgMpg && metrics.fleetAvgMpg > 0 ? metrics.fleetAvgMpg : metrics.mpg || 1;
  const mpgScore = Math.max(0, Math.min(100, (metrics.mpg / refMpg) * 60));

  // Safety sub-score: stubbed at full score until event APIs are connected
  const safetyScore = 100;
  void safetyEvents; // reserved for future use

  return Math.round(
    idleScore * SCORE_WEIGHTS.idle +
    mpgScore * SCORE_WEIGHTS.mpg +
    safetyScore * SCORE_WEIGHTS.safety
  );
}

/** Returns the badge variant for a given driver score. */
export function scoreVariant(score: number): 'success' | 'warning' | 'destructive' {
  if (score >= 80) return 'success';
  if (score >= 60) return 'warning';
  return 'destructive';
}
