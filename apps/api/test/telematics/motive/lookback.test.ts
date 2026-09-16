import { describe, it, expect } from 'vitest';
import {
  planMotiveDailyPasses,
  resolveMotiveLookbackDays,
  MOTIVE_DEFAULT_LOOKBACK_DAYS,
  MOTIVE_MAX_LOOKBACK_DAYS,
  MOTIVE_LOOKBACK_START_DAYS,
} from '../../../src/telematics/motive/lookback.js';
import { getDaysAgoEastern } from '../../../src/telematics/dates.js';

// The Motive cron fires at 11:00 UTC (07:00 Eastern in summer).
const cronAt = (iso: string) => new Date(iso);

describe('getDaysAgoEastern', () => {
  it('resolves the Eastern date, not the UTC date', () => {
    // 03:00 UTC on Jul 21 is still Jul 20 in Eastern (EDT, UTC-4).
    expect(getDaysAgoEastern(0, cronAt('2026-07-21T03:00:00Z'))).toBe('2026-07-20');
    expect(getDaysAgoEastern(1, cronAt('2026-07-21T03:00:00Z'))).toBe('2026-07-19');
  });

  it('walks back across a month boundary', () => {
    expect(getDaysAgoEastern(3, cronAt('2026-08-02T11:00:00Z'))).toBe('2026-07-30');
  });
});

describe('planMotiveDailyPasses', () => {
  it('yesterday is the primary pass and every lookback day is a verify pass', () => {
    const passes = planMotiveDailyPasses(cronAt('2026-07-21T11:00:00Z'), 7);
    expect(passes.map((p) => [p.date, p.verify])).toEqual([
      ['2026-07-20', false],
      ['2026-07-19', true],
      ['2026-07-18', true],
      ['2026-07-17', true],
      ['2026-07-16', true],
      ['2026-07-15', true],
      ['2026-07-14', true],
    ]);
  });

  it('covers the observed gap: Jul 16 is still re-verified on Jul 21 and Jul 23', () => {
    // Under the old single-day lookback, Jul 16 was verified once (Jul 20)
    // and never again. Motive added three idle events for driver 5494617
    // after that pass, so they were never inserted.
    const jul21 = planMotiveDailyPasses(cronAt('2026-07-21T11:00:00Z'));
    const jul23 = planMotiveDailyPasses(cronAt('2026-07-23T11:00:00Z'));
    expect(jul21.find((p) => p.date === '2026-07-16')?.verify).toBe(true);
    expect(jul23.find((p) => p.date === '2026-07-16')?.verify).toBe(true);
  });

  it('defaults to the 7-day window', () => {
    const passes = planMotiveDailyPasses(cronAt('2026-07-21T11:00:00Z'));
    expect(passes).toHaveLength(MOTIVE_DEFAULT_LOOKBACK_DAYS);
    expect(passes[passes.length - 1].daysAgo).toBe(MOTIVE_DEFAULT_LOOKBACK_DAYS);
  });

  it('never produces duplicate dates', () => {
    const passes = planMotiveDailyPasses(cronAt('2026-03-10T11:00:00Z'), 14); // spans DST start
    const dates = passes.map((p) => p.date);
    expect(new Set(dates).size).toBe(dates.length);
  });

  it('clamps the window to the allowed range', () => {
    expect(planMotiveDailyPasses(cronAt('2026-07-21T11:00:00Z'), 0)).toHaveLength(
      MOTIVE_LOOKBACK_START_DAYS
    );
    expect(planMotiveDailyPasses(cronAt('2026-07-21T11:00:00Z'), 999)).toHaveLength(
      MOTIVE_MAX_LOOKBACK_DAYS
    );
  });
});

describe('resolveMotiveLookbackDays', () => {
  it('falls back to the default when unset or garbage', () => {
    expect(resolveMotiveLookbackDays({})).toBe(MOTIVE_DEFAULT_LOOKBACK_DAYS);
    expect(resolveMotiveLookbackDays({ MOTIVE_LOOKBACK_DAYS: '' })).toBe(MOTIVE_DEFAULT_LOOKBACK_DAYS);
    expect(resolveMotiveLookbackDays({ MOTIVE_LOOKBACK_DAYS: 'week' })).toBe(MOTIVE_DEFAULT_LOOKBACK_DAYS);
  });

  it('honors a valid override and clamps out-of-range values', () => {
    expect(resolveMotiveLookbackDays({ MOTIVE_LOOKBACK_DAYS: '10' })).toBe(10);
    expect(resolveMotiveLookbackDays({ MOTIVE_LOOKBACK_DAYS: '1' })).toBe(MOTIVE_LOOKBACK_START_DAYS);
    expect(resolveMotiveLookbackDays({ MOTIVE_LOOKBACK_DAYS: '400' })).toBe(MOTIVE_MAX_LOOKBACK_DAYS);
  });
});
