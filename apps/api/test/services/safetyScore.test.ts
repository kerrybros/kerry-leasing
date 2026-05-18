import { describe, it, expect } from 'vitest';
import {
  SAFETY_EVENT_WEIGHTS,
  weightedEventTotal,
  safetyScoreFromRate,
} from '../../src/services/safetyScore.js';

describe('safetyScore weighting', () => {
  it('uses Motive road-facing published weights', () => {
    expect(SAFETY_EVENT_WEIGHTS.tailgating).toBe(15);
    expect(SAFETY_EVENT_WEIGHTS.stop_sign_violation).toBe(12);
    expect(SAFETY_EVENT_WEIGHTS.hard_brake).toBe(6);
    expect(SAFETY_EVENT_WEIGHTS.hard_corner).toBe(5);
    expect(SAFETY_EVENT_WEIGHTS.hard_accel).toBe(1);
    expect(SAFETY_EVENT_WEIGHTS.speeding).toBe(11);
  });

  it('weights speeding (11) but excludes non-behavioral events', () => {
    // speeding is weighted; the valid-only filter is a query-layer concern
    // (status='valid' in the scorecard service), not in weightedEventTotal.
    expect(weightedEventTotal([{ eventType: 'speeding' }])).toBe(11);
    expect(weightedEventTotal([{ eventType: 'speeding', severity: 'critical' }])).toBe(22); // 11 * 2.0
    const excluded = weightedEventTotal([
      { eventType: 'manual_event' },
      { eventType: 'road_facing_cam_obstruction' },
      { eventType: 'unknown_future_type' },
    ]);
    expect(excluded).toBe(0);
  });

  it('sums event-type weights', () => {
    // 2 hard brakes (6) + 1 tailgating (15) = 27
    const total = weightedEventTotal([
      { eventType: 'hard_brake' },
      { eventType: 'hard_brake' },
      { eventType: 'tailgating' },
    ]);
    expect(total).toBe(27);
  });

  it('applies severity multiplier only when severity present', () => {
    expect(weightedEventTotal([{ eventType: 'hard_brake' }])).toBe(6);
    expect(weightedEventTotal([{ eventType: 'hard_brake', severity: 'critical' }])).toBe(12); // 6 * 2.0
    expect(weightedEventTotal([{ eventType: 'hard_brake', severity: null }])).toBe(6);
  });
});

describe('safetyScoreFromRate — window-correct by construction', () => {
  it('100 when no events; 100 when no events even with 0 miles', () => {
    expect(safetyScoreFromRate(0, 1000)).toBe(100);
    expect(safetyScoreFromRate(0, 0)).toBe(100);
  });

  it('worst score (0) when events but no miles', () => {
    expect(safetyScoreFromRate(10, 0)).toBe(0);
  });

  it('is monotonic: more weighted events per mile → lower score', () => {
    const light = safetyScoreFromRate(6, 5000);
    const heavy = safetyScoreFromRate(60, 5000);
    expect(heavy).toBeLessThan(light);
    expect(light).toBeLessThanOrEqual(100);
    expect(heavy).toBeGreaterThanOrEqual(0);
  });

  it('period rollup is path-independent (depends only on totals) — the bug Motive’s daily score has', () => {
    // Same period totals (6 weighted events, 1000 mi) reached two different ways.
    const splitA = [
      { weighted: weightedEventTotal([{ eventType: 'hard_brake' }]), miles: 50 },  // 6 / 50mi
      { weighted: 0, miles: 950 },
    ];
    const splitB = [
      { weighted: 2, miles: 300 },
      { weighted: 4, miles: 700 },
    ];

    const periodScore = (days: { weighted: number; miles: number }[]) =>
      safetyScoreFromRate(
        days.reduce((s, d) => s + d.weighted, 0),
        days.reduce((s, d) => s + d.miles, 0),
      );

    // Our method: identical regardless of how the period is split (correct).
    expect(periodScore(splitA)).toBeCloseTo(periodScore(splitB), 10);

    // Naive "average of daily scores" (what averaging Motive's daily score does):
    // split-dependent → produces two different answers for the same period.
    // (magnitude depends on the calibrated decay constant; only assert the
    // conceptual defect — path-dependence — which holds for any constant)
    const naiveAvg = (days: { weighted: number; miles: number }[]) =>
      days.reduce((s, d) => s + safetyScoreFromRate(d.weighted, d.miles), 0) / days.length;
    expect(Math.abs(naiveAvg(splitA) - naiveAvg(splitB))).toBeGreaterThan(1e-6);
  });
});
