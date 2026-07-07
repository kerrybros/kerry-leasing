import { describe, it, expect } from 'vitest';
import { isReportReachable } from '../../../src/features/smsWeeklyReports/reportPolicy.js';

/**
 * Regression guard: the ranked/report population must include a driver reachable
 * on ANY channel. Before this was fixed, "reachable" meant "has a phone", so
 * email-only drivers fell out of the ranking and their weekly email rendered
 * "rank 0 of N".
 */
describe('isReportReachable', () => {
  const base = { optedOut: false, phoneE164: null, emailOptedOut: false, email: null } as const;

  it('phone only → reachable', () => {
    expect(isReportReachable({ ...base, phoneE164: '+15551234567' })).toBe(true);
  });

  it('email only → reachable (regression: previously landed at rank 0)', () => {
    expect(isReportReachable({ ...base, email: 'driver@fleet.com' })).toBe(true);
  });

  it('neither phone nor email → not reachable', () => {
    expect(isReportReachable(base)).toBe(false);
  });

  it('SMS-opted-out with no email → not reachable', () => {
    expect(isReportReachable({ ...base, phoneE164: '+15551234567', optedOut: true })).toBe(false);
  });

  it('SMS-opted-out but has email → reachable via email', () => {
    expect(
      isReportReachable({ ...base, phoneE164: '+15551234567', optedOut: true, email: 'd@f.com' }),
    ).toBe(true);
  });

  it('email-opted-out but has phone → reachable via phone', () => {
    expect(
      isReportReachable({ ...base, email: 'd@f.com', emailOptedOut: true, phoneE164: '+15551234567' }),
    ).toBe(true);
  });

  it('opted out of both → not reachable', () => {
    expect(
      isReportReachable({ optedOut: true, phoneE164: '+1', emailOptedOut: true, email: 'd@f.com' }),
    ).toBe(false);
  });
});
