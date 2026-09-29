import { describe, it, expect } from 'vitest';
import { planPullWindows } from '../../../src/features/motiveReport/portalPull.js';

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
