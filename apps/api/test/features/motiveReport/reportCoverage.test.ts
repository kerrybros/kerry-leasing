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
