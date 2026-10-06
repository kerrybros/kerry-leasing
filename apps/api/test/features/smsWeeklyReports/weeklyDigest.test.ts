import { describe, it, expect } from 'vitest';
import {
  buildWeeklyDigest,
  buildFleetRows,
  formatReportSubject,
  formatExceptionsSubject,
  formatWeeklyDigestText,
  formatWeeklyDigestHtml,
  formatExceptionsHtml,
  sentDrivers,
  missedDrivers,
} from '../../../src/features/smsWeeklyReports/weeklyDigest.js';
import type { SendOrgResult, WeeklyDigestDriver } from '../../../src/features/smsWeeklyReports/sendOrgWeeklyReports.js';
import type { FleetTotals } from '../../../src/features/smsWeeklyReports/weeklyDigestData.js';

const driver = (over: Partial<WeeklyDigestDriver> = {}): WeeklyDigestDriver => ({
  displayName: 'Tony Jones',
  channels: [{ channel: 'SMS' as any, status: 'DELIVERED' as any }],
  score: 80, idlePct: 20, avgMpg: 7.3, totalMiles: 900,
  scoreVsAvg: 1, idlePctPtsVsAvg: -0.5, weeksOfData: 4, noActivity: false, vehicles: ['114'],
  phoneE164: '+13135550123', email: 'tony@wolverinepacking.com', idlePctLastWeek: 21,
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
    fleet: { current: totals(), previous: totals() }, reportDisplayName: 'Wolverine',
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

describe('subjects', () => {
  it('names the customer, so a forwarded report says whose fleet it is', () => {
    const s = formatReportSubject(buildWeeklyDigest([org([driver(), driver({ displayName: 'B' })])]));
    expect(s).toContain('Wolverine Weekly Driver Report');
    expect(s).toContain('2 drivers');
  });

  it('falls back to a generic subject when no customer name is set', () => {
    const d = buildWeeklyDigest([org([driver()], { reportDisplayName: null } as any)]);
    expect(formatReportSubject(d)).toMatch(/^Weekly Driver Report:/);
  });

  it('counts only drivers who received something', () => {
    const d = buildWeeklyDigest([org([driver(), driver({ displayName: 'B', channels: [] })])]);
    expect(formatReportSubject(d)).toContain('1 driver');
  });

  it('counts drivers a preview WOULD send to, rather than reporting zero', () => {
    // A dry run marks a driver it would have sent to as SKIPPED. Reading that
    // as a miss made a healthy preview announce that every driver was missed.
    const wouldSend = { channels: [{ channel: 'SMS' as any, status: 'SKIPPED' as any }] };
    const d = buildWeeklyDigest([org([driver(wouldSend), driver({ displayName: 'B', ...wouldSend })])]);
    expect(formatReportSubject(d, { preview: true })).toContain('2 drivers');
    expect(missedDrivers(d, true)).toEqual([]);
  });

  it('still counts a genuinely blocked driver as missed on a preview', () => {
    const d = buildWeeklyDigest([org([
      driver({ channels: [{ channel: 'SMS' as any, status: 'SKIPPED' as any }] }),
      driver({ displayName: 'NoConsent', channels: [{ channel: 'SMS' as any, status: 'NO_CONSENT' as any }] }),
    ])]);
    expect(missedDrivers(d, true).map((x) => x.displayName)).toEqual(['NoConsent']);
    expect(formatExceptionsSubject(d, { preview: true })).toContain('1 not sent');
  });

  it('counts the misses in the exceptions subject', () => {
    const d = buildWeeklyDigest([org([
      driver(),
      driver({ displayName: 'B', channels: [], suppressedReason: 'no phone' }),
      driver({ displayName: 'C', channels: [{ channel: 'SMS' as any, status: 'FAILED' as any, error: 'x' }] }),
    ])]);
    expect(formatExceptionsSubject(d)).toContain('2 not sent');
  });
});

describe('splitting sent from missed', () => {
  const d = () => buildWeeklyDigest([org([
    driver({ displayName: 'Sent' }),
    driver({ displayName: 'NoPhone', channels: [], suppressedReason: 'no phone or email on file' }),
    driver({ displayName: 'Failed', channels: [{ channel: 'SMS' as any, status: 'FAILED' as any, error: 'carrier' }] }),
  ])]);

  it('counts a delivered driver as sent', () => {
    expect(sentDrivers(d()).map((x) => x.displayName)).toEqual(['Sent']);
  });

  it('counts both a suppression and a failure as missed', () => {
    expect(missedDrivers(d()).map((x) => x.displayName).sort()).toEqual(['Failed', 'NoPhone']);
  });
});

describe('the clean report', () => {
  const html = (over: Partial<WeeklyDigestDriver>[] = []) =>
    formatWeeklyDigestHtml(buildWeeklyDigest([org(over.map((o) => driver(o)))]));

  it('lists only drivers who actually received a report', () => {
    const h = html([{ displayName: 'Sent' }, { displayName: 'Missed', channels: [], suppressedReason: 'no phone' }]);
    expect(h).toContain('Sent');
    expect(h).not.toContain('Missed');
  });

  it('carries no status column at all, because every row has the same status', () => {
    const h = html([{}]);
    expect(h).not.toContain('>Status<');
    expect(h).not.toContain('delivered');
  });

  it('shows phone and email instead', () => {
    const h = html([{}]);
    expect(h).toContain('>Phone<');
    expect(h).toContain('>Email<');
    expect(h).toContain('+13135550123');
    expect(h).toContain('tony@wolverinepacking.com');
  });

  it('rules every cell, so the grid reads as a grid', () => {
    expect(html([{}])).toContain('border:1px solid');
  });

  it('keeps the fleet totals above the drivers', () => {
    const h = html([{}]);
    expect(h.indexOf('Fleet totals')).toBeLessThan(h.indexOf('Drivers ('));
  });

  it('escapes a driver name rather than letting it break the markup', () => {
    expect(html([{ displayName: 'A & <b>B</b>' }])).toContain('A &amp; &lt;b&gt;B&lt;/b&gt;');
  });
});

describe('the exceptions report', () => {
  it('names each missed driver and why, with how to reach them', () => {
    const h = formatExceptionsHtml(buildWeeklyDigest([org([
      driver({ displayName: 'Amir', channels: [], suppressedReason: 'no phone or email on file', phoneE164: null, email: null }),
    ])]));
    expect(h).toContain('Amir');
    expect(h).toContain('no phone or email on file');
    expect(h).toContain('no phone');
  });

  it('gives the carrier reason for a failed send', () => {
    const h = formatExceptionsHtml(buildWeeklyDigest([org([
      driver({ displayName: 'Ezekiel', channels: [{ channel: 'SMS' as any, status: 'FAILED' as any, error: 'unreachable carrier' }] }),
    ])]));
    expect(h).toContain('unreachable carrier');
  });

  it('reports a broken run, which is a fact rather than a judgement', () => {
    const h = formatExceptionsHtml(buildWeeklyDigest([org([], { success: false, error: 'refused: mixed sources' })]));
    expect(h).toContain('Run errors');
    expect(h).toContain('refused: mixed sources');
  });

  it('says so plainly when nobody was missed', () => {
    expect(formatExceptionsHtml(buildWeeklyDigest([org([driver()])]))).toContain('Every driver received their report');
  });

  it('never lists a driver who was sent', () => {
    const h = formatExceptionsHtml(buildWeeklyDigest([org([driver({ displayName: 'Tony Jones' })])]));
    expect(h).not.toContain('Tony Jones');
  });
});

describe('plain text fallback', () => {
  it('uses the word units and includes fleet totals and contacts', () => {
    const text = formatWeeklyDigestText(buildWeeklyDigest([org([driver({ vehicles: ['114', '108'] })])]));
    expect(text).toContain('units 114/108');
    expect(text).toContain('FLEET TOTALS');
    expect(text).toContain('+13135550123');
  });
});

describe('idle against last week', () => {
  const d = (idle: number, last: number | null) =>
    buildWeeklyDigest([org([driver({ idlePct: idle, idlePctLastWeek: last })])]);

  it('reads falling idle as good, because idle is fuel burned standing still', () => {
    const h = formatWeeklyDigestHtml(d(14.0, 20.0));
    expect(h).toContain('-6.0 pts');
    expect(h).toContain('#047857'); // green
  });

  it('reads rising idle as bad', () => {
    const h = formatWeeklyDigestHtml(d(26.0, 20.0));
    expect(h).toContain('+6.0 pts');
    expect(h).toContain('#b91c1c'); // red
  });

  it('says level rather than inventing a move for a trivial change', () => {
    expect(formatWeeklyDigestHtml(d(20.01, 20.0))).toContain('level');
  });

  it('says new when there is no prior week to compare against', () => {
    expect(formatWeeklyDigestHtml(d(20.0, null))).toMatch(/vs last wk[\s\S]*?new/);
  });

  it('shows the two metrics that matter, and drops the per-driver miles column', () => {
    const h = formatWeeklyDigestHtml(d(20.0, 18.0));
    expect(h).toContain('>Score<');
    expect(h).toContain('>vs avg<');
    expect(h).toContain('>Idle<');
    expect(h).toContain('>vs last wk<');
    // No Miles COLUMN on the driver table. Fleet totals still carry a Miles
    // row, which is context for the week rather than a per-driver judgement.
    const header = /background:#f6f7f8">Miles</;
    expect(header.test(h)).toBe(false);
    expect(h).toContain('Miles');
  });
});

describe('final render', () => {
  it('drops the test banner so the report can be forwarded', () => {
    const digest = buildWeeklyDigest([org([driver()])]);
    expect(formatWeeklyDigestHtml(digest, { preview: true })).toContain('TEST PREVIEW');
    expect(formatWeeklyDigestHtml(digest, { preview: true, hideTestBanner: true })).not.toContain('TEST PREVIEW');
  });

  it('still selects the same drivers, so the content does not change', () => {
    const digest = buildWeeklyDigest([org([
      driver({ channels: [{ channel: 'SMS' as any, status: 'SKIPPED' as any }] }),
      driver({ displayName: 'Blocked', channels: [{ channel: 'SMS' as any, status: 'NO_CONSENT' as any }] }),
    ])]);
    const final = formatWeeklyDigestHtml(digest, { preview: true, hideTestBanner: true });
    expect(final).toContain('Tony Jones');
    expect(final).not.toContain('Blocked');
  });
});

describe('column headings do not break mid-word', () => {
  // Narrow columns were rendering "Idle" as "Idl e" and "Units" as "Unit s".
  const h = () => formatWeeklyDigestHtml(buildWeeklyDigest([org([driver()])]));

  it('keeps every heading on one line', () => {
    const headers = h().match(/<th[^>]*>/g) ?? [];
    expect(headers.length).toBeGreaterThan(0);
    for (const th of headers) expect(th).toContain('white-space:nowrap');
  });

  it('keeps the numeric cells and units on one line too', () => {
    const html = h();
    // Idle reads "2.9%" not "2.9" over "%".
    expect(html).toMatch(/text-align:right;white-space:nowrap">[\d.]+%/);
    expect(html).toMatch(/white-space:nowrap;color:#6b7280">114/);
  });

  it('lets only the email wrap, since it is the one genuinely long field', () => {
    expect(h()).toContain('overflow-wrap:anywhere');
  });

  it('applies the same treatment to the exceptions table', () => {
    const html = formatExceptionsHtml(buildWeeklyDigest([org([
      driver({ displayName: 'Amir', channels: [], suppressedReason: 'no phone' }),
    ])]));
    for (const th of html.match(/<th[^>]*>/g) ?? []) expect(th).toContain('white-space:nowrap');
  });
});
