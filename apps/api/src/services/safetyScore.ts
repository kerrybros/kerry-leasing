/**
 * SAFETY SUB-SCORE — per-mile, Motive-weighted driver safety.
 *
 * Built from `motive_driver_performance_events` (per-event, summable). We do NOT
 * use Motive's daily `score` (not aggregatable) — we sum weighted events over the
 * period and divide by miles, so the result is correct for any window.
 *
 * Weights follow Motive's published *road-facing AI camera* Safety-Score defaults
 * where Motive publishes them; events Motive doesn't publish a weight for are
 * assigned a defensible weight below.
 *
 * Speeding (weight 11) is wired in but sourced from a SEPARATE table
 * (`motive_speeding_events`) and folded into the weighted total by the scorecard
 * service — filtered to `status = 'valid'`. Today this fleet's speeding is
 * ~99.9% "invalid" (speeding definition not configured in Motive), so valid
 * speeding ≈ 0 and it contributes nothing until Motive is configured + the data
 * re-backfilled. No further code change needed when that happens; just re-run
 * scripts/calibrate-safety.ts since speeding will shift the rate distribution.
 */

export const SAFETY_EVENT_WEIGHTS: Record<string, number> = {
  // Motive road-facing published defaults
  tailgating: 15,
  stop_sign_violation: 12,
  speeding: 11, // sourced from motive_speeding_events (valid-only); see header
  hard_brake: 6,
  hard_corner: 5,
  hard_accel: 1,
  hard_acceleration: 1, // API name variance
  // Assigned (Motive does not publish these for road-facing)
  crash: 30,
  near_miss: 12,
  forward_collision_warning: 12,
  unsafe_lane_change: 5,
  aggregated_lane_swerving: 3,
  // Excluded (weight 0): manual_event,
  // road_facing_cam_obstruction, driver_facing_cam_obstruction
};

/**
 * Optional severity multiplier. Applied only when an event carries a severity
 * (perf-events currently store null severity for this fleet, so this is a
 * defensive no-op today; speeding — excluded — is the field that has it).
 */
export const SEVERITY_MULTIPLIER: Record<string, number> = {
  low: 0.6,
  medium: 1.0,
  high: 1.5,
  critical: 2.0,
};

/**
 * Rate→score decay constant: weighted events per 1,000 mi mapped to 0–100 via
 * 100·exp(-rate/DECAY). Calibrated 2026-05-18 against the fleet's actual
 * distribution (44 drivers, 90d) via scripts/calibrate-safety.ts: median driver
 * rate ≈9.7 → score 80; worst decile → ~18. Re-run that script after the
 * 12-month backfill to re-verify. Higher = more lenient.
 */
export const SAFETY_RATE_DECAY = 43;

export interface SafetyEventInput {
  eventType: string;
  severity?: string | null;
}

/**
 * One safety event, normalized across sources. A speeding event from
 * `motive_speeding_events` and a hard-brake from `motive_driver_performance_events`
 * are the same thing here — both are just safety events.
 */
export interface NormalizedSafetyEvent extends SafetyEventInput {
  driverId: number;
  date: string; // YYYY-MM-DD
}

/** Weighted event total for one driver over a period (sum is window-correct). */
export function weightedEventTotal(events: SafetyEventInput[]): number {
  let total = 0;
  for (const e of events) {
    const w = SAFETY_EVENT_WEIGHTS[e.eventType];
    if (!w) continue; // unknown/excluded event types contribute nothing
    const sev = e.severity ? SEVERITY_MULTIPLIER[e.severity] ?? 1 : 1;
    total += w * sev;
  }
  return total;
}

/** weighted events per 1,000 mi → 0–100 safety sub-score. */
export function safetyScoreFromRate(weightedEvents: number, miles: number): number {
  if (miles <= 0) return weightedEvents > 0 ? 0 : 100;
  const ratePer1000 = weightedEvents / (miles / 1000);
  return Math.max(0, Math.min(100, 100 * Math.exp(-ratePer1000 / SAFETY_RATE_DECAY)));
}
