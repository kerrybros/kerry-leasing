/**
 * SAMSARA → MOTIVE BEHAVIOR LABEL MAPPING
 *
 * Translates Samsara's `behaviorLabel` enum into the snake_case eventType keys
 * used by SAFETY_EVENT_WEIGHTS in services/safetyScore.ts. The same scorecard
 * math then runs unchanged for both providers. Labels we don't map contribute
 * nothing to the score (same behaviour Motive's unknown event_types have).
 *
 * IMPORTANT: Samsara exposes safety events under two endpoints with DIFFERENT
 * casing conventions on the same conceptual labels:
 *   - Legacy `/fleet/safety-events`  → camelCase  (e.g. `acceleration`, `braking`, `harshTurn`)
 *   - Modern `/safety-events/stream` → PascalCase (e.g. `Acceleration`, `Braking`, `HarshTurn`)
 *
 * Our current sync (syncSamsaraSafetyEvents.ts) uses the legacy endpoint, so
 * camelCase is what actually lands in samsara_safety_events today. Both forms
 * are mapped here so a future switch to the modern stream needs no follow-up
 * change in the scorecard service.
 *
 * Labels copied from the published Samsara API definitions (May 2026).
 */

export interface NormalizedBehavior {
  /** Snake_case event type matching SAFETY_EVENT_WEIGHTS in safetyScore.ts. */
  eventType: string;
  /** Severity for the multiplier; derived from the label when Samsara doesn't provide one. */
  severity?: 'low' | 'medium' | 'high' | 'critical' | null;
}

// Canonical map keyed by the lowercased Samsara label. Lowercasing collapses
// the camelCase / PascalCase variants into a single entry.
const LOOKUP: Record<string, NormalizedBehavior> = {
  // Harsh maneuvers
  acceleration:                       { eventType: 'hard_accel' },
  braking:                            { eventType: 'hard_brake' },
  harshturn:                          { eventType: 'hard_corner' },

  // Speeding (severity derived from label tier)
  speeding:                           { eventType: 'speeding', severity: 'medium' },
  lightspeeding:                      { eventType: 'speeding', severity: 'low' },
  moderatespeeding:                   { eventType: 'speeding', severity: 'medium' },
  heavyspeeding:                      { eventType: 'speeding', severity: 'high' },
  severespeeding:                     { eventType: 'speeding', severity: 'critical' },
  maxspeed:                           { eventType: 'speeding', severity: 'critical' },

  // Tailgating / following distance
  followingdistance:                  { eventType: 'tailgating' },
  followingdistancemoderate:          { eventType: 'tailgating', severity: 'medium' },
  followingdistancesevere:            { eventType: 'tailgating', severity: 'high' },
  generictailgating:                  { eventType: 'tailgating' },

  // Collision-related
  crash:                              { eventType: 'crash', severity: 'critical' },
  nearcollison:                       { eventType: 'near_miss' }, // (Samsara spells it without the 'i')
  nearcollision:                      { eventType: 'near_miss' }, // (defensive — in case they fix the typo)
  nearpedestriancollision:            { eventType: 'near_miss', severity: 'high' },
  forwardcollisionwarning:            { eventType: 'forward_collision_warning' },
  rearcollisionwarning:               { eventType: 'forward_collision_warning' },
  vulnerableroadusercollisionwarning: { eventType: 'forward_collision_warning', severity: 'high' },

  // Stop-sign / red-light / yielding
  rollingstop:                        { eventType: 'stop_sign_violation' },
  ranredlight:                        { eventType: 'stop_sign_violation', severity: 'high' },
  didnotyield:                        { eventType: 'stop_sign_violation' },

  // Lane / steering
  lanedeparture:                      { eventType: 'unsafe_lane_change' },
  unsafemaneuver:                     { eventType: 'unsafe_lane_change' },
  yawcontrol:                         { eventType: 'aggregated_lane_swerving' },
};

/**
 * Normalize a Samsara behaviorLabel + severity into the shape safetyScore.ts
 * consumes. Returns null when the label is unmapped (contextual tags, dashcam-
 * only obstructions, training markers, distractions without a weight, etc.).
 */
export function mapSamsaraBehavior(
  behaviorLabel: string,
  apiSeverity?: string | null
): NormalizedBehavior | null {
  if (!behaviorLabel) return null;
  const normalized = LOOKUP[behaviorLabel.toLowerCase()];
  if (!normalized) return null;
  const severity = normalizeSeverity(apiSeverity) ?? normalized.severity ?? null;
  return { eventType: normalized.eventType, severity };
}

function normalizeSeverity(s?: string | null): NormalizedBehavior['severity'] | null {
  if (!s) return null;
  const lower = s.toLowerCase();
  if (lower === 'low' || lower === 'medium' || lower === 'high' || lower === 'critical') {
    return lower;
  }
  return null;
}
