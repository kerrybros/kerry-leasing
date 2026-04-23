import { describe, it, expect } from 'vitest';
import { daysJobOpenInclusive } from './repairJobDaysOpen';

describe('daysJobOpenInclusive', () => {
  it('same day is 1', () => {
    expect(daysJobOpenInclusive('2026-02-02', '2026-02-02')).toBe(1);
  });

  it('counts inclusive calendar days', () => {
    expect(daysJobOpenInclusive('2026-02-01', '2026-02-03')).toBe(3);
  });

  it('returns null when a date is missing', () => {
    expect(daysJobOpenInclusive(null, '2026-01-01')).toBeNull();
  });

  it('returns null when close is before open', () => {
    expect(daysJobOpenInclusive('2026-02-10', '2026-02-01')).toBeNull();
  });
});
