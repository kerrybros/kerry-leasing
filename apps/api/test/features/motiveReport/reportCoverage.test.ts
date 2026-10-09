import { describe, it, expect } from 'vitest';
import { tileRange } from '../../../src/features/motiveReport/reportCoverage.js';

const W = (s: string, e: string) => ({ windowStart: s, windowEnd: e });

describe('tileRange', () => {
  it('tiles a week from seven daily files', () => {
    const days = ['07', '08', '09', '10', '11', '12', '13'].map((d) => W(`2026-09-${d}`, `2026-09-${d}`));
    expect(tileRange('2026-09-07', '2026-09-13', days)?.windows).toHaveLength(7);
  });

  it('prefers the weekly export over daily files for the same week', () => {
    const days = ['07', '08', '09', '10', '11', '12', '13'].map((d) => W(`2026-09-${d}`, `2026-09-${d}`));
    const cov = tileRange('2026-09-07', '2026-09-13', [...days, W('2026-09-07', '2026-09-13')]);
    expect(cov?.windows).toEqual([W('2026-09-07', '2026-09-13')]);
  });

  it('mixes a weekly export and daily files across a longer range', () => {
    const cov = tileRange('2026-09-07', '2026-09-15', [
      W('2026-09-07', '2026-09-13'), W('2026-09-14', '2026-09-14'), W('2026-09-15', '2026-09-15'),
    ]);
    expect(cov?.windows.map((w) => w.windowStart)).toEqual(['2026-09-07', '2026-09-14', '2026-09-15']);
  });

  it('returns null on any gap (whole range falls back to the API)', () => {
    expect(tileRange('2026-09-07', '2026-09-13', [W('2026-09-07', '2026-09-10'), W('2026-09-12', '2026-09-13')])).toBeNull();
  });

  it('ignores windows that spill outside the range', () => {
    // A monthly export cannot serve a mid-month week.
    expect(tileRange('2026-07-06', '2026-07-12', [W('2026-07-01', '2026-07-31')])).toBeNull();
    // But it serves the month itself.
    expect(tileRange('2026-07-01', '2026-07-31', [W('2026-07-01', '2026-07-31')])?.windows).toHaveLength(1);
  });

  it('does not take a window that overshoots the end date', () => {
    expect(tileRange('2026-09-07', '2026-09-10', [W('2026-09-07', '2026-09-13')])).toBeNull();
  });
});

describe('resolveDailyReportCoverage (per-day surfaces)', () => {
  // The drivers page needs a value PER DAY, so a weekly file is no use to it
  // even though the general tiler prefers one. Asking "are all the chosen
  // tiles single days?" failed as soon as weekly files existed, dropping the
  // whole range to the API that inflates idle on yard trucks.
  it('is a different question from general coverage', () => {
    const available = [
      { windowStart: '2026-09-21', windowEnd: '2026-09-27' }, // a week
      ...['21', '22', '23', '24', '25', '26', '27'].map((d) => ({
        windowStart: `2026-09-${d}`,
        windowEnd: `2026-09-${d}`,
      })),
    ];
    // General tiling prefers the week: one tile, not seven.
    const general = tileRange('2026-09-21', '2026-09-27', available);
    expect(general!.windows).toHaveLength(1);
    expect(general!.windows[0].windowEnd).toBe('2026-09-27');
  });

  it('a range is only daily-covered when every single day has its own file', () => {
    const days = ['2026-09-21', '2026-09-22', '2026-09-23'];
    const all = days.map((d) => ({ windowStart: d, windowEnd: d }));
    expect(tileRange('2026-09-21', '2026-09-23', all)!.windows).toHaveLength(3);
    // Drop the middle day: the range can no longer be served per-day.
    const missing = all.filter((w) => w.windowStart !== '2026-09-22');
    expect(tileRange('2026-09-21', '2026-09-23', missing)).toBeNull();
  });
});
