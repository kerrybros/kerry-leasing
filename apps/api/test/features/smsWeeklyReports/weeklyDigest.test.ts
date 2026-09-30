import { describe, it, expect } from 'vitest';
import {
  buildWeeklyDigest,
  formatWeeklyDigestSubject,
  formatWeeklyDigestText,
  SCORE_SWING_POINTS,
  IDLE_SWING_PCT_POINTS,
} from '../../../src/features/smsWeeklyReports/weeklyDigest.js';
import type { SendOrgResult, WeeklyDigestDriver } from '../../../src/features/smsWeeklyReports/sendOrgWeeklyReports.js';

const driver = (over: Partial<WeeklyDigestDriver> = {}): WeeklyDigestDriver => ({
  displayName: 'Tony Jones',
  channels: [{ channel: 'EMAIL' as any, status: 'DELIVERED' as any }],
  score: 80, idlePct: 20, avgMpg: 7.3, totalMiles: 900,
  scoreVsAvg: 1, idlePctPtsVsAvg: -0.5, weeksOfData: 4, noActivity: false,
  ...over,
});

const org = (digest: WeeklyDigestDriver[], over: Partial<SendOrgResult> = {}): SendOrgResult =>
  ({
    clerkOrgId: 'org_x', success: true, weekStart: '2026-09-21', weekEnd: '2026-09-27',
    duration: 1, channels: [], driversTotal: digest.length, driversSent: digest.length,
    driversSkipped: 0, driversFailed: 0, driversNoPhone: 0, driversOptedOut: 0,
    driversNoConsent: 0, reports: [], digest, ...over,
  }) as SendOrgResult;

describe('buildWeeklyDigest', () => {
  it('counts who actually received something', () => {
    const d = buildWeeklyDigest([org([driver(), driver({ displayName: 'B' })])]);
    expect(d.sentCount).toBe(2);
    expect(d.failedCount).toBe(0);
    expect(d.outliers).toEqual([]);
  });

  it('flags a failed send with the reason attached', () => {
    const d = buildWeeklyDigest([org([
      driver({ displayName: 'Ezekiel', channels: [{ channel: 'SMS' as any, status: 'FAILED' as any, error: 'unreachable carrier' }] }),
    ])]);
    expect(d.failedCount).toBe(1);
    expect(d.outliers[0]).toMatchObject({ displayName: 'Ezekiel', kind: 'send-failed' });
    expect(d.outliers[0].detail).toContain('unreachable carrier');
  });

  it('flags a driver who received nothing at all, naming why', () => {
    const d = buildWeeklyDigest([org([
      driver({ displayName: 'Amir', channels: [], suppressedReason: 'no phone or email on file' }),
    ])]);
    expect(d.notSentCount).toBe(1);
    expect(d.outliers[0]).toMatchObject({ kind: 'not-sent', detail: 'no phone or email on file' });
  });

  it('treats a first-week driver as new rather than as an anomaly', () => {
    // A new driver has no average, so a huge apparent swing is meaningless.
    const d = buildWeeklyDigest([org([driver({ displayName: 'Rookie', weeksOfData: 1, scoreVsAvg: -40, idlePctPtsVsAvg: 30 })])]);
    expect(d.newDrivers.map((n) => n.displayName)).toEqual(['Rookie']);
    expect(d.outliers).toEqual([]);
  });

  it('flags a real score swing, and ignores an ordinary wobble', () => {
    const big = buildWeeklyDigest([org([driver({ scoreVsAvg: -SCORE_SWING_POINTS })])]);
    expect(big.outliers.map((o) => o.kind)).toContain('score-swing');
    const small = buildWeeklyDigest([org([driver({ scoreVsAvg: -(SCORE_SWING_POINTS - 1) })])]);
    expect(small.outliers).toEqual([]);
  });

  it('flags a real idle swing in percentage points', () => {
    const d = buildWeeklyDigest([org([driver({ idlePctPtsVsAvg: IDLE_SWING_PCT_POINTS })])]);
    expect(d.outliers[0].kind).toBe('idle-swing');
    expect(d.outliers[0].detail).toContain('points vs their 4 week average');
  });

  it('reports a driver with history who did nothing this week', () => {
    const d = buildWeeklyDigest([org([driver({ displayName: 'Dominic', noActivity: true, scoreVsAvg: -60 })])]);
    // One line about the blank week, not a spurious swing against a blank week.
    expect(d.outliers.map((o) => o.kind)).toEqual(['stopped-working']);
  });

  it('does not call a brand new driver with no activity "stopped working"', () => {
    const d = buildWeeklyDigest([org([driver({ weeksOfData: 1, noActivity: true })])]);
    expect(d.outliers).toEqual([]);
  });

  it('surfaces a whole-org failure, such as the mixed-source refusal', () => {
    const d = buildWeeklyDigest([org([], { success: false, error: 'refused: week 2026-09-07 came from MOTIVE_API' })]);
    expect(d.errors[0]).toContain('MOTIVE_API');
  });
});

describe('digest wording', () => {
  it('says all clean in the subject when nothing needs attention', () => {
    const s = formatWeeklyDigestSubject(buildWeeklyDigest([org([driver(), driver()])]));
    expect(s).toContain('2 sent');
    expect(s).toContain('all clean');
  });

  it('counts the problems in the subject when there are some', () => {
    const s = formatWeeklyDigestSubject(buildWeeklyDigest([org([
      driver({ channels: [{ channel: 'SMS' as any, status: 'FAILED' as any, error: 'x' }] }),
      driver({ displayName: 'B', channels: [], suppressedReason: 'no phone' }),
    ])]));
    expect(s).toContain('2 need a look');
  });

  it('states plainly when nothing was out of place', () => {
    expect(formatWeeklyDigestText(buildWeeklyDigest([org([driver()])]))).toContain('Nothing looked out of place.');
  });

  it('lists every driver with what they got, marking the new ones', () => {
    const text = formatWeeklyDigestText(buildWeeklyDigest([org([
      driver({ displayName: 'Tony Jones' }),
      driver({ displayName: 'Rookie', weeksOfData: 1 }),
    ])]));
    expect(text).toContain('Tony Jones');
    expect(text).toContain('EMAIL:DELIVERED');
    expect(text).toContain('NEW THIS WEEK (1)');
    expect(text).toMatch(/Rookie.*new/);
  });

  it('names the reason inline for a driver who got nothing', () => {
    const text = formatWeeklyDigestText(buildWeeklyDigest([org([
      driver({ displayName: 'Amir', channels: [], suppressedReason: 'no phone or email on file' }),
    ])]));
    expect(text).toContain('NOT SENT (no phone or email on file)');
  });
});
