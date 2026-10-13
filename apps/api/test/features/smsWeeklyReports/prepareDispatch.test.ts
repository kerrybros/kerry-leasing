import { describe, it, expect } from 'vitest';
import { classifyWeekReadiness } from '../../../src/features/smsWeeklyReports/weekReadiness.js';
import {
  isAlreadyDelivered,
  TERMINAL_SEND_STATUSES,
} from '../../../src/features/smsWeeklyReports/sendOrgWeeklyReports.js';
import { sentDrivers, missedDrivers } from '../../../src/features/smsWeeklyReports/weeklyDigest.js';
import { formatDivergenceText } from '../../../src/features/smsWeeklyReports/frozenDivergence.js';
import { DriverSmsStatus } from '../../../src/generated/app-client/index.js';
import type { WeeklyDigest, WeeklyDigestDriver } from '../../../src/features/smsWeeklyReports/sendOrgWeeklyReports.js';

const WEEK_START = '2026-10-05';
const WEEK_END = '2026-10-11';
const ALL_DAYS = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'];
const day = (d: string, status = 'ACCEPTED') => ({ windowStart: d, windowEnd: d, status });

describe('week readiness, the gate on freezing a week early', () => {
  it('is ready when every day has an accepted file', () => {
    const r = classifyWeekReadiness(WEEK_START, WEEK_END, ALL_DAYS.map((d) => day(d)));
    expect(r.ready).toBe(true);
    expect(r.reason).toBeNull();
  });

  it('holds when a day has no file at all, since the week cannot be tiled', () => {
    const r = classifyWeekReadiness(WEEK_START, WEEK_END, ALL_DAYS.filter((d) => d !== '2026-10-08').map((d) => day(d)));
    expect(r.ready).toBe(false);
    expect(r.missingDays).toEqual(['2026-10-08']);
    expect(r.reason).toContain('2026-10-08');
  });

  it('holds when a day is unverified, which is the signature of a batch still landing', () => {
    // This is the 2026-10-13 case: Sunday's file was short a driver that a
    // later pull added, and freezing before that would have shipped a card
    // missing a day.
    const rows = ALL_DAYS.map((d) => day(d, d === '2026-10-11' ? 'UNVERIFIED' : 'ACCEPTED'));
    const r = classifyWeekReadiness(WEEK_START, WEEK_END, rows);
    expect(r.ready).toBe(false);
    expect(r.unverifiedDays).toEqual(['2026-10-11']);
  });

  it('clears a day that a later pull accepted, so one early miss does not block the week', () => {
    const rows = [...ALL_DAYS.map((d) => day(d)), day('2026-10-11', 'UNVERIFIED')];
    expect(classifyWeekReadiness(WEEK_START, WEEK_END, rows).ready).toBe(true);
  });

  it('ignores multi-day windows, which cannot stand in for a missing day file', () => {
    const rows = [{ windowStart: WEEK_START, windowEnd: WEEK_END, status: 'ACCEPTED' }];
    const r = classifyWeekReadiness(WEEK_START, WEEK_END, rows);
    expect(r.ready).toBe(false);
    expect(r.missingDays).toEqual(ALL_DAYS);
  });
});

describe('already-delivered guard', () => {
  it('treats SENT and DELIVERED as terminal, so nothing re-texts a driver', () => {
    expect(isAlreadyDelivered(DriverSmsStatus.SENT)).toBe(true);
    expect(isAlreadyDelivered(DriverSmsStatus.DELIVERED)).toBe(true);
    expect(TERMINAL_SEND_STATUSES).toEqual([DriverSmsStatus.SENT, DriverSmsStatus.DELIVERED]);
  });

  it('leaves a queued row sendable and a failed row retryable', () => {
    expect(isAlreadyDelivered(DriverSmsStatus.QUEUED)).toBe(false);
    expect(isAlreadyDelivered(DriverSmsStatus.FAILED)).toBe(false);
  });

  it('treats an absent row as not delivered', () => {
    expect(isAlreadyDelivered(null)).toBe(false);
    expect(isAlreadyDelivered(undefined)).toBe(false);
  });
});

describe('the report counts a prepared week as real', () => {
  const driver = (name: string, status: string): WeeklyDigestDriver =>
    ({
      displayName: name,
      channels: [{ channel: 'SMS', status: status as DriverSmsStatus, error: null }],
      motiveSafetyScore: 100,
      motiveSafetyVsAvg: null,
      score: 0,
      idlePct: 0,
      idleFuelGal: 0,
      idleFuelGalLastWeek: null,
      idlePctLastWeek: null,
      avgMpg: 0,
      totalMiles: 0,
      scoreVsAvg: 0,
      idlePctPtsVsAvg: 0,
      weeksOfData: 4,
      noActivity: false,
      vehicles: [],
      phoneE164: '+15551234567',
      email: null,
    }) as WeeklyDigestDriver;

  const digest = {
    drivers: [driver('Queued', 'QUEUED'), driver('NoConsent', 'NO_CONSENT')],
    errors: [],
  } as unknown as WeeklyDigest;

  it('lists a frozen QUEUED driver on the clean report', () => {
    // This is what makes the 07:00 email the real document: those drivers will
    // receive exactly the card that was frozen, so the report is a statement
    // about real cards rather than a forecast.
    expect(sentDrivers(digest, 'prepared').map((d) => d.displayName)).toEqual(['Queued']);
    expect(missedDrivers(digest, 'prepared').map((d) => d.displayName)).toEqual(['NoConsent']);
  });

  it('does not count a queued driver as sent once the week has been dispatched', () => {
    expect(sentDrivers(digest, 'sent')).toEqual([]);
  });

  it('still honours the old boolean preview flag', () => {
    const preview = { drivers: [driver('Would', 'SKIPPED')], errors: [] } as unknown as WeeklyDigest;
    expect(sentDrivers(preview, true).map((d) => d.displayName)).toEqual(['Would']);
  });
});

describe('divergence note', () => {
  it('says nothing when nothing moved', () => {
    expect(formatDivergenceText([])).toBe('');
  });

  it('names the driver, the field and both figures, and says the card stands', () => {
    const text = formatDivergenceText([
      { displayName: 'Jamie Shell', field: 'miles', frozen: 3474, fresh: 3745 },
    ]);
    expect(text).toContain('Jamie Shell');
    expect(text).toContain('3474');
    expect(text).toContain('3745');
    expect(text).toContain('Drivers received the reviewed card');
  });
});
