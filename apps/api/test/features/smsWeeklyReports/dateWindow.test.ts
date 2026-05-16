import { describe, it, expect } from 'vitest';
import { getLastWeekRange, getTrailing4WeekRanges, currentHourInEt } from '../../../src/features/smsWeeklyReports/dateWindow.js';

describe('getLastWeekRange', () => {
  it('returns previous Mon..Sun when called on a Monday', () => {
    // 2026-05-11 is a Monday (UTC); in ET it's also Monday after midnight.
    const now = new Date('2026-05-11T15:00:00Z');
    const r = getLastWeekRange(now);
    expect(r.startDate).toBe('2026-05-04');
    expect(r.endDate).toBe('2026-05-10');
  });

  it('returns this week\'s Mon..Sun (just past) when called on a Sunday', () => {
    const now = new Date('2026-05-10T15:00:00Z'); // Sunday
    const r = getLastWeekRange(now);
    expect(r.startDate).toBe('2026-04-27');
    expect(r.endDate).toBe('2026-05-03');
  });

  it('returns the most recent Mon..Sun when called on a Thursday', () => {
    const now = new Date('2026-05-14T15:00:00Z'); // Thursday
    const r = getLastWeekRange(now);
    expect(r.startDate).toBe('2026-05-04');
    expect(r.endDate).toBe('2026-05-10');
  });
});

describe('getTrailing4WeekRanges', () => {
  it('returns 4 weeks, oldest → newest, last matching getLastWeekRange', () => {
    const now = new Date('2026-05-11T15:00:00Z');
    const weeks = getTrailing4WeekRanges(now);
    expect(weeks).toHaveLength(4);
    expect(weeks[0].startDate).toBe('2026-04-13');
    expect(weeks[1].startDate).toBe('2026-04-20');
    expect(weeks[2].startDate).toBe('2026-04-27');
    expect(weeks[3].startDate).toBe('2026-05-04');
    const last = getLastWeekRange(now);
    expect(weeks[3]).toEqual(last);
  });
});

describe('currentHourInEt', () => {
  it('returns the ET hour', () => {
    // 14:00 UTC during EDT (UTC-4) = 10am ET; during EST = 9am ET. Either is acceptable.
    const h = currentHourInEt(new Date('2026-05-12T14:00:00Z'));
    expect([9, 10]).toContain(h);
  });
});
