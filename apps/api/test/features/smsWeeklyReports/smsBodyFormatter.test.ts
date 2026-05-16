import { describe, it, expect } from 'vitest';
import { formatSmsBody } from '../../../src/features/smsWeeklyReports/smsBodyFormatter.js';

describe('formatSmsBody', () => {
  it('formats a regular weekly body — greeting + rank + link only', () => {
    const body = formatSmsBody({
      firstName: 'Jane',
      rank: 4,
      totalDrivers: 23,
      noActivity: false,
      reportUrl: 'https://k.l/r/abc',
    });
    expect(body).toBe('Hi Jane, you ranked 4 of 23 this week. Full scorecard: https://k.l/r/abc');
  });

  it('formats a no-activity body', () => {
    const body = formatSmsBody({
      firstName: 'Jane',
      rank: 30,
      totalDrivers: 30,
      noActivity: true,
      reportUrl: 'https://k.l/r/abc',
    });
    expect(body).toContain('no driving recorded');
    expect(body).toContain('https://k.l/r/abc');
    expect(body).not.toContain('ranked');
  });

  it('stays inside a single SMS segment for typical names + URLs', () => {
    const body = formatSmsBody({
      firstName: 'Christopher',
      rank: 12,
      totalDrivers: 30,
      noActivity: false,
      reportUrl: 'https://www.kerryleasing.com/r/0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    });
    // 160 is the single-segment GSM-7 limit; we comfortably fit.
    expect(body.length).toBeLessThan(160);
  });

  it('never mentions tier / gold / silver / bronze', () => {
    const body = formatSmsBody({
      firstName: 'Jane',
      rank: 1,
      totalDrivers: 23,
      noActivity: false,
      reportUrl: 'https://k.l/r/abc',
    });
    expect(body).not.toMatch(/Bronze|Silver|Gold/i);
  });
});
