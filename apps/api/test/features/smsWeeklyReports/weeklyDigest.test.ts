import { describe, it, expect } from 'vitest';
import {
  buildWeeklyDigest,
  buildFleetRows,
  formatWeeklyDigestSubject,
  formatWeeklyDigestText,
  formatWeeklyDigestHtml,
} from '../../../src/features/smsWeeklyReports/weeklyDigest.js';
import type { SendOrgResult, WeeklyDigestDriver } from '../../../src/features/smsWeeklyReports/sendOrgWeeklyReports.js';
import type { FleetTotals } from '../../../src/features/smsWeeklyReports/weeklyDigestData.js';

const driver = (over: Partial<WeeklyDigestDriver> = {}): WeeklyDigestDriver => ({
  displayName: 'Tony Jones',
  channels: [{ channel: 'SMS' as any, status: 'DELIVERED' as any }],
  score: 80, idlePct: 20, avgMpg: 7.3, totalMiles: 900,
  scoreVsAvg: 1, idlePctPtsVsAvg: -0.5, weeksOfData: 4, noActivity: false, vehicles: ['114'],
  ...over,
});

const totals = (over: Partial<FleetTotals> = {}): FleetTotals => ({
  weekStart: '2026-09-21', weekEnd: '2026-09-27', drivers: 35,
  totalMiles: 100000, totalFuelGal: 13700, idleFuelGal: 1200, avgMpg: 7.3, idlePct: 20, ...over,
});

const org = (digest: WeeklyDigestDriver[], over: Partial<SendOrgResult> = {}): SendOrgResult =>
  ({
    clerkOrgId: 'org_x', success: true, weekStart: '2026-09-21', weekEnd: '2026-09-27',
    duration: 1, channels: [], driversTotal: digest.length, driversSent: digest.length,
    driversSkipped: 0, driversFailed: 0, driversNoPhone: 0, driversOptedOut: 0,
    driversNoConsent: 0, reports: [], digest,
    fleet: { current: totals(), previous: totals() },
    ...over,
  }) as SendOrgResult;

describe('buildWeeklyDigest', () => {
  it('counts who received, who failed and who got nothing', () => {
    const d = buildWeeklyDigest([org([
      driver(),
      driver({ displayName: 'B', channels: [{ channel: 'SMS' as any, status: 'FAILED' as any, error: 'carrier' }] }),
      driver({ displayName: 'C', channels: [], suppressedReason: 'no phone or email on file' }),
    ])]);
    expect(d.sentCount).toBe(1);
    expect(d.failedCount).toBe(1);
    expect(d.notSentCount).toBe(1);
  });

  it('surfaces a whole-org failure, such as the mixed-source refusal', () => {
    const d = buildWeeklyDigest([org([], { success: false, error: 'refused: week 2026-09-07 came from MOTIVE_API' })]);
    expect(d.errors[0]).toContain('MOTIVE_API');
  });

  it('carries the fleet comparison through', () => {
    expect(buildWeeklyDigest([org([driver()])]).fleet.current?.drivers).toBe(35);
  });
});

describe('buildFleetRows', () => {
  it('reads more miles as good and more fuel burned as bad', () => {
    const rows = buildFleetRows(totals({ totalMiles: 110000, totalFuelGal: 14500 }), totals());
    expect(rows.find((r) => r.label === 'Miles')!.tone).toBe('good');
    expect(rows.find((r) => r.label === 'Fuel used (gal)')!.tone).toBe('bad');
  });

  it('reads falling idle as good, because idle is money burned standing still', () => {
    const down = buildFleetRows(totals({ idlePct: 17 }), totals({ idlePct: 22 }));
    const idle = down.find((r) => r.label === 'Idle')!;
    expect(idle.tone).toBe('good');
    expect(idle.change).toBe('-5.0 pts');
    expect(buildFleetRows(totals({ idlePct: 25 }), totals({ idlePct: 22 })).find((r) => r.label === 'Idle')!.tone).toBe('bad');
  });

  it('reads rising MPG as good', () => {
    const mpg = buildFleetRows(totals({ avgMpg: 7.6 }), totals({ avgMpg: 7.3 })).find((r) => r.label === 'Fleet MPG')!;
    expect(mpg.tone).toBe('good');
    expect(mpg.current).toBe('7.60');
  });

  it('marks an unchanged metric flat rather than good or bad', () => {
    expect(buildFleetRows(totals(), totals()).every((r) => r.tone === 'flat')).toBe(true);
  });

  it('says n/a rather than inventing a comparison when last week is missing', () => {
    const rows = buildFleetRows(totals(), null);
    expect(rows[0].previous).toBe('n/a');
    expect(rows[0].change).toBe('');
  });

  it('does not report a driver count, which the fleet table does not need', () => {
    expect(buildFleetRows(totals(), totals()).map((r) => r.label)).not.toContain('Drivers reported');
  });

  it('returns nothing at all when this week has no report data', () => {
    expect(buildFleetRows(null, totals())).toEqual([]);
  });

  it('formats large counts readably', () => {
    expect(buildFleetRows(totals({ totalMiles: 109223 }), totals())[0].current).toBe('109,223');
  });
});

describe('digest wording', () => {
  it('states the counts plainly in the subject, with no judgement', () => {
    const s = formatWeeklyDigestSubject(buildWeeklyDigest([org([driver(), driver({ displayName: 'B' })])]));
    expect(s).toContain('2 sent');
    expect(s).not.toMatch(/look|clean/i);
  });

  it('names failures and non-sends in the subject when there are some', () => {
    const s = formatWeeklyDigestSubject(buildWeeklyDigest([org([
      driver({ channels: [{ channel: 'SMS' as any, status: 'FAILED' as any, error: 'x' }] }),
      driver({ displayName: 'B', channels: [], suppressedReason: 'no phone' }),
    ])]));
    expect(s).toContain('1 failed');
    expect(s).toContain('1 not sent');
  });

  it('says "would send" on a preview, never "0 sent"', () => {
    const d = buildWeeklyDigest([org([driver({ channels: [] }), driver({ displayName: 'B', channels: [] })])]);
    expect(formatWeeklyDigestSubject(d, { preview: true })).toContain('2 would send');
  });
});

describe('digest html', () => {
  it('shows fleet totals above the driver table', () => {
    const html = formatWeeklyDigestHtml(buildWeeklyDigest([org([driver()])]));
    expect(html.indexOf('Fleet totals')).toBeLessThan(html.indexOf('Drivers ('));
    expect(html).toContain('This week');
    expect(html).toContain('Last week');
  });

  it('calls the column Units and lists every unit a driver was in', () => {
    const html = formatWeeklyDigestHtml(buildWeeklyDigest([org([driver({ vehicles: ['114', '108'] })])]));
    expect(html).toContain('>Units<');
    expect(html).toContain('114, 108');
    expect(html).not.toContain('>Trucks<');
  });

  it('shows a dash when no unit is recorded', () => {
    expect(formatWeeklyDigestHtml(buildWeeklyDigest([org([driver({ vehicles: [] })])]))).toContain('&mdash;');
  });

  it('carries no judgement section at all', () => {
    const html = formatWeeklyDigestHtml(buildWeeklyDigest([org([
      driver({ scoreVsAvg: -40, idlePctPtsVsAvg: 30 }),
      driver({ displayName: 'New', weeksOfData: 1 }),
    ])]));
    expect(html).not.toMatch(/worth a look/i);
    expect(html).not.toMatch(/new this week/i);
    expect(html).not.toMatch(/out of place/i);
  });

  it('still reports a broken run, which is a fact rather than a judgement', () => {
    const html = formatWeeklyDigestHtml(buildWeeklyDigest([org([], { success: false, error: 'refused: mixed sources' })]));
    expect(html).toContain('Run errors');
    expect(html).toContain('refused: mixed sources');
  });

  it('names the reason inline for a driver who got nothing', () => {
    const html = formatWeeklyDigestHtml(buildWeeklyDigest([org([
      driver({ displayName: 'Amir', channels: [], suppressedReason: 'no phone or email on file' }),
    ])]));
    expect(html).toContain('not sent: no phone or email on file');
  });

  it('escapes a driver name rather than letting it break the markup', () => {
    const html = formatWeeklyDigestHtml(buildWeeklyDigest([org([driver({ displayName: 'A & <b>B</b>' })])]));
    expect(html).toContain('A &amp; &lt;b&gt;B&lt;/b&gt;');
  });
});

describe('plain text fallback', () => {
  it('uses the word units and includes fleet totals', () => {
    const text = formatWeeklyDigestText(buildWeeklyDigest([org([driver({ vehicles: ['114', '108'] })])]));
    expect(text).toContain('units 114/108');
    expect(text).toContain('FLEET TOTALS');
  });
});
