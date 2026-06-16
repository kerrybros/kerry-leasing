import { describe, it, expect } from 'vitest';
import { formatSmsBody } from '../../../src/features/smsWeeklyReports/smsBodyFormatter.js';

describe('formatSmsBody', () => {
  it('formats a regular weekly body — greeting + link only (no composite rank)', () => {
    const body = formatSmsBody({
      firstName: 'Jane',
      noActivity: false,
      reportUrl: 'https://k.l/r/abc',
    });
    expect(body).toBe('Hi Jane, your weekly driver scorecard is ready: https://k.l/r/abc');
    // Rankings now live on the linked page, not in the SMS body.
    expect(body).not.toContain('ranked');
  });

  it('formats a no-activity body', () => {
    const body = formatSmsBody({
      firstName: 'Jane',
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
      noActivity: false,
      reportUrl: 'https://www.kerryleasing.com/r/0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    });
    // 160 is the single-segment GSM-7 limit; we comfortably fit.
    expect(body.length).toBeLessThan(160);
  });

  it('never mentions tier / gold / silver / bronze', () => {
    const body = formatSmsBody({
      firstName: 'Jane',
      noActivity: false,
      reportUrl: 'https://k.l/r/abc',
    });
    expect(body).not.toMatch(/Bronze|Silver|Gold/i);
  });
});
