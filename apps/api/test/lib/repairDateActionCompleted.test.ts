import { describe, it, expect } from 'vitest';
import { parseDateActionCompletedToYmd, ymdMax } from '../../src/lib/repairDateActionCompleted.js';

describe('parseDateActionCompletedToYmd', () => {
  it('parses "8:21AM 2/2/2026" to Y-M-D', () => {
    expect(parseDateActionCompletedToYmd('8:21AM 2/2/2026')).toBe('2026-02-02');
  });

  it('parses PM time prefix', () => {
    expect(parseDateActionCompletedToYmd('3:45PM 12/1/2025')).toBe('2025-12-01');
  });

  it('parses bare M/D/YYYY', () => {
    expect(parseDateActionCompletedToYmd('2/2/2026')).toBe('2026-02-02');
  });

  it('parses plain ISO Y-M-D and timestamps', () => {
    expect(parseDateActionCompletedToYmd('2026-02-02')).toBe('2026-02-02');
    expect(parseDateActionCompletedToYmd('2025-12-15T00:00:00.000Z')).toBe('2025-12-15');
  });

  it('parses M-D-YYYY with dashes', () => {
    expect(parseDateActionCompletedToYmd('2-2-2026')).toBe('2026-02-02');
    expect(parseDateActionCompletedToYmd('1-15-2026')).toBe('2026-01-15');
  });

  it('returns null for empty', () => {
    expect(parseDateActionCompletedToYmd('')).toBeNull();
    expect(parseDateActionCompletedToYmd(null)).toBeNull();
  });
});

describe('ymdMax', () => {
  it('returns latest Y-M-D', () => {
    expect(ymdMax('2026-02-01', '2026-02-02')).toBe('2026-02-02');
    expect(ymdMax(null, '2026-01-01')).toBe('2026-01-01');
  });
});
