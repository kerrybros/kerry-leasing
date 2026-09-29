import { describe, it, expect } from 'vitest';
import {
  planPullWindows,
  driversBelowActivityFloor,
  MIN_ACTIVITY_SECONDS,
} from '../../../src/features/motiveReport/portalPull.js';

describe('planPullWindows', () => {
  it('covers 14 daily windows, 6 completed Mon..Sun weeks, MTD and prior month, all ending by yesterday', () => {
    // Friday 2026-09-18 ET
    const w = planPullWindows('2026-09-18');
    const dailies = w.filter((x) => x.windowStart === x.windowEnd).map((x) => x.windowStart);
    expect(dailies).toHaveLength(14);
    expect(dailies[0]).toBe('2026-09-17');
    expect(dailies[13]).toBe('2026-09-04');
    // Six weeks, not four: the weekly driver card shows a four week trend, so
    // the plan has to stay ahead of it with room to spare. Four would leave the
    // oldest week uncovered the moment a week rolls over.
    const weeks = w.filter((x) => x.windowStart !== x.windowEnd && !x.windowStart.endsWith('-01'));
    expect(weeks).toEqual([
      { windowStart: '2026-09-07', windowEnd: '2026-09-13' },
      { windowStart: '2026-08-31', windowEnd: '2026-09-06' },
      { windowStart: '2026-08-24', windowEnd: '2026-08-30' },
      { windowStart: '2026-08-17', windowEnd: '2026-08-23' },
      { windowStart: '2026-08-10', windowEnd: '2026-08-16' },
      { windowStart: '2026-08-03', windowEnd: '2026-08-09' },
    ]);
    expect(weeks.length).toBeGreaterThan(4);
    expect(w).toContainEqual({ windowStart: '2026-09-01', windowEnd: '2026-09-17' }); // MTD
    expect(w).toContainEqual({ windowStart: '2026-08-01', windowEnd: '2026-08-31' }); // prior month
    expect(w.every((x) => x.windowEnd <= '2026-09-17')).toBe(true);
  });

  it('on a Monday, the newest completed week ends yesterday (Sunday)', () => {
    const weeks = planPullWindows('2026-09-21').filter((x) => x.windowStart !== x.windowEnd && !x.windowStart.endsWith('-01'));
    expect(weeks[0]).toEqual({ windowStart: '2026-09-14', windowEnd: '2026-09-20' });
  });

  it('on the 1st there is no month-to-date window, only the prior month', () => {
    const w = planPullWindows('2026-10-01');
    expect(w.filter((x) => x.windowStart === '2026-10-01')).toHaveLength(0);
    expect(w).toContainEqual({ windowStart: '2026-09-01', windowEnd: '2026-09-30' });
  });
});

describe('driversBelowActivityFloor', () => {
  const row = (driverId: number, first: string, last: string, drivingTime: number, idleTime: number) => ({
    driverId, driverFirstName: first, driverLastName: last, drivingTime, idleTime,
  });

  it('flags a genuinely working driver the report left out', () => {
    const r = driversBelowActivityFloor(
      [row(1, 'Tre', 'Jeknavorian', 9000, 600), row(2, 'Jose', 'Duque', 7000, 400)],
      new Set(['jose duque'])
    );
    expect(r.active).toBe(2);
    expect(r.missing).toEqual(['tre jeknavorian']);
  });

  it('ignores a driver whose whole window is under the two-minute floor', () => {
    // The two real cases that blocked the 90 day backfill: 105s and 106s, both
    // absent from Motive's own report because it has its own floor.
    const r = driversBelowActivityFloor(
      [row(1, 'Tre', 'Jeknavorian', 0, 105), row(2, 'Jose', 'Duque', 106, 0)],
      new Set()
    );
    expect(r.active).toBe(0);
    expect(r.missing).toEqual([]);
  });

  it('treats the floor as inclusive, and anything under it as not working', () => {
    const at = driversBelowActivityFloor([row(1, 'A', 'B', MIN_ACTIVITY_SECONDS, 0)], new Set());
    expect(at.missing).toEqual(['a b']);
    const under = driversBelowActivityFloor([row(1, 'A', 'B', MIN_ACTIVITY_SECONDS - 1, 0)], new Set());
    expect(under.missing).toEqual([]);
  });

  it('sums a driver across the whole window, not one arbitrary day', () => {
    // Four days of 40s each clears the floor together though no single day does.
    const r = driversBelowActivityFloor(
      [row(1, 'A', 'B', 40, 0), row(1, 'A', 'B', 40, 0), row(1, 'A', 'B', 40, 0), row(1, 'A', 'B', 40, 0)],
      new Set()
    );
    expect(r.active).toBe(1);
    expect(r.missing).toEqual(['a b']);
  });

  it('counts driving and idle together toward the floor', () => {
    const r = driversBelowActivityFloor([row(1, 'A', 'B', 70, 70)], new Set());
    expect(r.missing).toEqual(['a b']);
  });

  it('skips rows with no driver attached and normalises doubled spaces', () => {
    const r = driversBelowActivityFloor(
      [row(null as any, 'X', 'Y', 9999, 0), row(3, 'Chris ', ' Gross', 9999, 0)],
      new Set()
    );
    expect(r.active).toBe(1);
    expect(r.missing).toEqual(['chris gross']);
  });
});
