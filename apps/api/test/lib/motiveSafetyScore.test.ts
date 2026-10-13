import { describe, it, expect } from 'vitest';
import { SCORED_ROWS_ONLY, isScored } from '../../src/lib/motiveSafetyScore.js';

describe('Motive safety score, zero means no score', () => {
  it('treats 0 as absent, because Motive sends it for a driver it has not scored', () => {
    // Brandon Stevenson's real payload on 2026-10-10: zero score, zero events,
    // 254 km driven. He is not the worst driver in the fleet, he is new.
    expect(isScored(0)).toBe(false);
  });

  it('treats null and undefined as absent', () => {
    expect(isScored(null)).toBe(false);
    expect(isScored(undefined)).toBe(false);
  });

  it('accepts every score Motive actually publishes', () => {
    for (const s of [1, 85, 95, 99, 100]) expect(isScored(s)).toBe(true);
  });

  it('filters the query to scored rows only, so a 0 cannot outrank an older real score', () => {
    expect(SCORED_ROWS_ONLY).toEqual({ gt: 0 });
  });
});
