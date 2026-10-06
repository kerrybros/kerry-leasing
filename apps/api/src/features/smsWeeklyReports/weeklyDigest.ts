/**
 * WEEKLY SEND DIGEST
 *
 * The operator-facing counterpart to the driver cards: after the weekly run,
 * one email with the fleet's numbers for the week against last week, then every
 * driver's own numbers and what they were sent.
 *
 * It exists because the send is silent when it works and was nearly silent when
 * it did not: a driver could be skipped for months and nobody would see it.
 *
 * Numbers only, deliberately. An earlier version flagged "outliers" it judged
 * worth a look; that was the tool deciding what mattered on behalf of people
 * who know the fleet far better than it does. Facts are reported and the
 * reader draws the conclusions.
 *
 * Built from the send results rather than re-derived afterwards, so what this
 * reports is exactly what the drivers received. Pure: no I/O, so the wording
 * and the arithmetic are testable without sending anything.
 */

import type { WeeklyDigestDriver, SendOrgResult } from './sendOrgWeeklyReports.js';
import type { FleetTotals } from './weeklyDigestData.js';

export interface WeeklyDigest {
  /** Customer-facing name for the subject line, e.g. "Wolverine". */
  reportDisplayName: string | null;
  fleet: { current: FleetTotals | null; previous: FleetTotals | null };
  weekStart: string;
  weekEnd: string;
  orgCount: number;
  sentCount: number;
  failedCount: number;
  notSentCount: number;
  drivers: WeeklyDigestDriver[];
  errors: string[];
}

function signed(n: number, digits = 1): string {
  const v = n.toFixed(digits);
  return n > 0 ? `+${v}` : v;
}

/**
 * Did this driver get their report?
 *
 * On a preview nothing is actually sent, so the question becomes "would they
 * have?". A dry run marks a driver it WOULD have sent to as SKIPPED, and leaves
 * the real blocking reason (NO_CONSENT, NO_PHONE, OPTED_OUT) in place for one
 * it would not. Reading SKIPPED as a miss made a healthy preview announce that
 * all 35 drivers had been missed.
 */
function reached(x: WeeklyDigestDriver, preview: boolean): boolean {
  return preview
    ? x.channels.some((c) => c.status === 'SKIPPED')
    : x.channels.some((c) => c.status === 'SENT' || c.status === 'DELIVERED');
}

/** Drivers who received a report. The clean report shows only these. */
export function sentDrivers(d: WeeklyDigest, preview = false): WeeklyDigestDriver[] {
  return d.drivers.filter((x) => reached(x, preview));
}

/** Everyone else: nothing sent, or a send that failed. The exceptions report. */
export function missedDrivers(d: WeeklyDigest, preview = false): WeeklyDigestDriver[] {
  return d.drivers.filter((x) => !reached(x, preview));
}

/** Why this driver got nothing, in the clearest terms available. */
export function missReason(d: WeeklyDigestDriver): string {
  const failed = d.channels.filter((c) => c.status === 'FAILED');
  if (failed.length > 0) {
    return failed.map((c) => `${c.channel} failed: ${c.error ?? 'no reason given'}`).join('; ');
  }
  if (d.channels.length === 0) return d.suppressedReason ?? 'no reason recorded';
  const s = d.channels.map((c) => `${c.channel} ${String(c.status).toLowerCase()}`).join(', ');
  return d.suppressedReason ? `${s} (${d.suppressedReason})` : s;
}

/** A driver on their first week of data has nothing to compare against yet. */
function isNew(d: WeeklyDigestDriver): boolean {
  return d.weeksOfData <= 1;
}

export function buildWeeklyDigest(results: SendOrgResult[]): WeeklyDigest {
  const drivers = results.flatMap((r) => r.digest);
  return {
    reportDisplayName: results[0]?.reportDisplayName ?? null,
    fleet: results[0]?.fleet ?? { current: null, previous: null },
    weekStart: results[0]?.weekStart ?? '',
    weekEnd: results[0]?.weekEnd ?? '',
    orgCount: results.length,
    sentCount: drivers.filter((d) => d.channels.some((c) => c.status === 'SENT' || c.status === 'DELIVERED')).length,
    failedCount: drivers.filter((d) => d.channels.some((c) => c.status === 'FAILED')).length,
    notSentCount: drivers.filter((d) => d.channels.length === 0).length,
    drivers,
    errors: results.filter((r) => r.error).map((r) => `${r.clerkOrgId}: ${r.error}`),
  };
}

// ---------------------------------------------------------------------------
// Fleet totals
// ---------------------------------------------------------------------------

/** One row of the fleet comparison: label, both weeks, and the change. */
export interface FleetRow {
  label: string;
  current: string;
  previous: string;
  change: string;
  /** Green where the change is good for the fleet, red where it is not. */
  tone: 'good' | 'bad' | 'flat';
}

function num(v: number, digits = 0): string {
  return v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/**
 * Fleet totals, this week against last.
 *
 * `lowerIsBetter` carries the direction per metric, because the same arrow
 * means opposite things for miles and for idle: more miles is the business
 * working, more idle is money burning in a stationary truck.
 */
export function buildFleetRows(current: FleetTotals | null, previous: FleetTotals | null): FleetRow[] {
  if (!current) return [];
  const row = (
    label: string,
    cur: number,
    prev: number | null,
    fmt: (v: number) => string,
    lowerIsBetter: boolean,
    pts = false,
  ): FleetRow => {
    if (prev == null) return { label, current: fmt(cur), previous: 'n/a', change: '', tone: 'flat' };
    const diff = cur - prev;
    const shown = pts ? `${signed(diff, 1)} pts` : signed(diff, Math.abs(diff) < 10 ? 2 : 0);
    const tone: FleetRow['tone'] =
      Math.abs(diff) < 1e-9 ? 'flat' : (diff < 0) === lowerIsBetter ? 'good' : 'bad';
    return { label, current: fmt(cur), previous: fmt(prev), change: shown, tone };
  };
  return [
    row('Miles', current.totalMiles, previous?.totalMiles ?? null, (v) => num(v), false),
    row('Fuel used (gal)', current.totalFuelGal, previous?.totalFuelGal ?? null, (v) => num(v), true),
    row('Fleet MPG', current.avgMpg, previous?.avgMpg ?? null, (v) => v.toFixed(2), false),
    row('Idle', current.idlePct, previous?.idlePct ?? null, (v) => `${v.toFixed(1)}%`, true, true),
    row('Idle fuel (gal)', current.idleFuelGal, previous?.idleFuelGal ?? null, (v) => num(v), true),
  ];
}

// ---------------------------------------------------------------------------
// Subject and plain-text fallback
// ---------------------------------------------------------------------------

function brand(d: WeeklyDigest): string {
  return d.reportDisplayName ? `${d.reportDisplayName} Weekly Driver Report` : 'Weekly Driver Report';
}

/** Subject for the clean report, the one that gets forwarded onward. */
export function formatReportSubject(d: WeeklyDigest, opts: { preview?: boolean } = {}): string {
  const n = sentDrivers(d, opts.preview === true).length;
  return `${brand(d)}: ${d.weekStart} to ${d.weekEnd} (${n} driver${n === 1 ? '' : 's'})`;
}

/** Subject for the exceptions report, which only goes out when there are any. */
export function formatExceptionsSubject(d: WeeklyDigest, opts: { preview?: boolean } = {}): string {
  const n = missedDrivers(d, opts.preview === true).length + d.errors.length;
  return `${brand(d)}: ${n} not sent, ${d.weekStart} to ${d.weekEnd}`;
}

export function formatWeeklyDigestText(d: WeeklyDigest): string {
  const lines: string[] = [`${brand(d)}`, `Week ${d.weekStart} to ${d.weekEnd}`, ''];
  const fleet = buildFleetRows(d.fleet.current, d.fleet.previous);
  if (fleet.length > 0) {
    lines.push('FLEET TOTALS (this week / last week / change)');
    for (const r of fleet) lines.push(`  ${r.label}: ${r.current} / ${r.previous} ${r.change}`);
    lines.push('');
  }
  const sent = sentDrivers(d);
  lines.push(`DRIVERS (${sent.length})`);
  for (const dr of [...sent].sort((a, b) => (b.motiveSafetyScore ?? -1) - (a.motiveSafetyScore ?? -1))) {
    lines.push(
      `  ${dr.displayName}: safety ${dr.motiveSafetyScore ?? '-'} ` +
        `(${dr.motiveSafetyVsAvg == null ? 'new' : signed(dr.motiveSafetyVsAvg, 0) + ' vs avg'}), ` +
        `idle ${dr.idlePct.toFixed(1)}% (${dr.idlePctLastWeek == null ? 'new' : signed(dr.idlePct - dr.idlePctLastWeek, 1) + ' pts vs last week'}), ` +
        `idle fuel ${dr.idleFuelGal.toFixed(1)} gal (${dr.idleFuelGalLastWeek == null ? 'new' : signed(dr.idleFuelGal - dr.idleFuelGalLastWeek, 1) + ' vs last week'}), units ${dr.vehicles.join('/') || '-'}, ` +
        `${dr.phoneE164 ?? 'no phone'}, ${dr.email ?? 'no email'}`,
    );
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// HTML rendering
//
// Email clients render a text body in a proportional font, which collapses the
// column padding of the plain-text table into an unreadable mess. So the real
// report is an HTML table. Inline styles only, table layout, no web fonts and
// no modern CSS: Outlook strips stylesheets and does not do flexbox or grid.
// The text version above stays as the fallback body.
// ---------------------------------------------------------------------------

const INK = '#1a1a1a';
const MUTED = '#6b7280';
const RULE = '#d7dbe0';
const GOOD = '#047857';
const BAD = '#b91c1c';
const WARN = '#b45309';
const FONT = '-apple-system,Segoe UI,Roboto,Arial,sans-serif';

function esc(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Green where a driver is doing well, amber mid, red where it needs a word. */
function scoreColor(score: number): string {
  if (score >= 70) return GOOD;
  if (score >= 40) return WARN;
  return BAD;
}

/**
 * Idle this week against last week, in percentage points.
 *
 * Deliberately last week rather than the four week average: idle is the number
 * a driver can change, and the question asked of it is "is this better than
 * last week" rather than "is this better than their own recent habit". Down is
 * green, because idle is fuel burned standing still.
 */
function idleVsLastWeekCell(d: WeeklyDigestDriver): string {
  if (d.idlePctLastWeek == null) return `<span style="color:${MUTED}">new</span>`;
  const diff = d.idlePct - d.idlePctLastWeek;
  if (Math.abs(diff) < 0.05) return `<span style="color:${MUTED}">level</span>`;
  return `<span style="color:${diff < 0 ? GOOD : BAD}">${signed(diff, 1)} pts</span>`;
}

/**
 * Motive's safety score against the average of the earlier weeks on this card.
 *
 * Deliberately Motive's own number rather than anything we derive: the report
 * has to be reconcilable against what Kerry sees in Motive, and a composite of
 * our own invention sitting in a column headed "Score" was read as the safety
 * score and did not match.
 */
function idleFuelVsLastWeekCell(d: WeeklyDigestDriver): string {
  if (d.idleFuelGalLastWeek == null) return `<span style="color:${MUTED}">new</span>`;
  const diff = d.idleFuelGal - d.idleFuelGalLastWeek;
  if (Math.abs(diff) < 0.05) return `<span style="color:${MUTED}">level</span>`;
  return `<span style="color:${diff < 0 ? GOOD : BAD}">${signed(diff, 1)}</span>`;
}

function safetyDeltaCell(d: WeeklyDigestDriver): string {
  if (d.motiveSafetyVsAvg == null) return `<span style="color:${MUTED}">new</span>`;
  if (Math.abs(d.motiveSafetyVsAvg) < 0.5) return `<span style="color:${MUTED}">level</span>`;
  return `<span style="color:${d.motiveSafetyVsAvg > 0 ? GOOD : BAD}">${signed(d.motiveSafetyVsAvg, 0)}</span>`;
}

/** Every cell is ruled on all sides, so the grid reads as a grid. */
const CELL = `border:1px solid ${RULE};padding:7px 10px`;

/**
 * A column heading.
 *
 * nowrap is the point: without it a narrow column breaks the heading mid-word,
 * so "Idle" renders as "Idl e" and "Units" as "Unit s". Headings are short
 * enough that keeping them on one line costs nothing, and the table is free to
 * widen instead. Letter-spacing is dropped for the same reason: it was pushing
 * borderline headings over the width at which they break.
 */
const TH = `${CELL};font:600 11px/1.2 ${FONT};color:${MUTED};text-transform:uppercase;white-space:nowrap;background:#f6f7f8`;

function head(label: string, align: 'left' | 'right' = 'left'): string {
  return `<th align="${align}" style="${TH}">${esc(label)}</th>`;
}

/** A column that has no pair, so it spans both header rows. */
function soloHead(label: string, align: 'left' | 'right' = 'left'): string {
  return `<th rowspan="2" align="${align}" style="${TH};vertical-align:bottom">${esc(label)}</th>`;
}

/** The label over a pair of columns, e.g. "Idle %" over this week and vs last week. */
function groupHead(label: string, span = 2): string {
  return `<th colspan="${span}" align="center" style="${TH};color:${INK};letter-spacing:.03em">${esc(label)}</th>`;
}

function shell(title: string, sub: string, banner: string, body: string): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#ffffff">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#ffffff">
   <tr><td align="center" style="padding:24px 16px">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:860px;text-align:left">
      <tr><td>
        ${banner}
        <div style="font:600 19px/1.3 ${FONT};color:${INK}">${esc(title)}</div>
        <div style="font:14px/1.5 ${FONT};color:${MUTED};margin:2px 0 20px 0">${esc(sub)}</div>
        ${body}
      </td></tr>
    </table>
   </td></tr>
  </table>
  </body></html>`;
}

function previewBanner(preview: boolean): string {
  return preview
    ? `<div style="font:600 13px/1.5 ${FONT};color:${WARN};border:1px solid ${WARN};padding:8px 12px;margin-bottom:18px">TEST PREVIEW. Nothing was sent to any driver.</div>`
    : '';
}

function fleetTable(d: WeeklyDigest): string {
  const rows = buildFleetRows(d.fleet.current, d.fleet.previous);
  if (rows.length === 0) return '';
  const td = `${CELL};font:14px/1.5 ${FONT};color:${INK}`;
  const body = rows
    .map((r) => {
      const color = r.tone === 'good' ? GOOD : r.tone === 'bad' ? BAD : MUTED;
      return `<tr>
        <td style="${td};white-space:nowrap">${esc(r.label)}</td>
        <td style="${td};text-align:right;font-weight:600;white-space:nowrap">${esc(r.current)}</td>
        <td style="${td};text-align:right;color:${MUTED}">${esc(r.previous)}</td>
        <td style="${td};text-align:right;color:${color}">${esc(r.change)}</td>
      </tr>`;
    })
    .join('');
  return `
    <div style="font:600 13px/1.4 ${FONT};color:${INK};margin:0 0 8px 0">Fleet totals</div>
    <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:26px">
      <tr>${head('')}${head('This week', 'right')}${head('Last week', 'right')}${head('Change', 'right')}</tr>
      ${body}
    </table>`;
}

/**
 * The clean report. Only drivers who actually received something, because this
 * is the document that gets forwarded to the fleet admin: anything listed here
 * went out. No status column, since every row has the same status. Phone and
 * email instead, so a conversation about a driver does not need a lookup.
 */
export function formatWeeklyDigestHtml(
  d: WeeklyDigest,
  opts: { preview?: boolean; hideTestBanner?: boolean } = {},
): string {
  const preview = opts.preview === true;
  const shown = sentDrivers(d, preview);
  const td = `${CELL};font:14px/1.5 ${FONT};color:${INK}`;

  const rows = [...shown]
    .sort((a, b) => (b.motiveSafetyScore ?? -1) - (a.motiveSafetyScore ?? -1))
    .map(
      (dr) => `
      <tr>
        <td style="${td};white-space:nowrap">${esc(dr.displayName)}${isNew(dr) ? ` <span style="font-size:11px;color:${MUTED}">NEW</span>` : ''}</td>
        <td style="${td};text-align:right;font-weight:600;white-space:nowrap;color:${dr.motiveSafetyScore == null ? MUTED : scoreColor(dr.motiveSafetyScore)}">${dr.motiveSafetyScore == null ? '&mdash;' : dr.motiveSafetyScore.toFixed(0)}</td>
        <td style="${td};text-align:right;white-space:nowrap">${safetyDeltaCell(dr)}</td>
        <td style="${td};text-align:right;white-space:nowrap">${dr.idlePct.toFixed(1)}%</td>
        <td style="${td};text-align:right;white-space:nowrap">${idleVsLastWeekCell(dr)}</td>
        <td style="${td};text-align:right;white-space:nowrap">${dr.idleFuelGal.toFixed(1)}</td>
        <td style="${td};text-align:right;white-space:nowrap">${idleFuelVsLastWeekCell(dr)}</td>
        <td style="${td};white-space:nowrap;color:${MUTED}">${dr.vehicles.length ? esc(dr.vehicles.join(', ')) : '&mdash;'}</td>
        <td style="${td};white-space:nowrap">${dr.phoneE164 ? esc(dr.phoneE164) : `<span style="color:${MUTED}">&mdash;</span>`}</td>
        <td style="${td};overflow-wrap:anywhere">${dr.email ? esc(dr.email) : `<span style="color:${MUTED}">&mdash;</span>`}</td>
      </tr>`,
    )
    .join('');

  const body = `
    ${fleetTable(d)}
    <div style="font:600 13px/1.4 ${FONT};color:${INK};margin:0 0 8px 0">Drivers (${shown.length})</div>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse">
      <tr>
        ${soloHead('Driver')}
        ${groupHead('Motive safety')}
        ${groupHead('Idle %')}
        ${groupHead('Idle fuel (gal)')}
        ${soloHead('Units')}
        ${soloHead('Phone')}
        ${soloHead('Email')}
      </tr>
      <tr>
        ${head('Score', 'right')}${head('vs avg', 'right')}
        ${head('This week', 'right')}${head('vs last wk', 'right')}
        ${head('This week', 'right')}${head('vs last wk', 'right')}
      </tr>
      ${rows}
    </table>
    <div style="font:12px/1.5 ${FONT};color:${MUTED};margin-top:16px">
      Safety is Motive's own rolling four week safety score, shown exactly as Motive reports it. "vs avg" compares it with the average of the earlier weeks on this report. "vs last wk" is the change in idle against last week, in percentage points, where down is better.
    </div>`;

  return shell(brand(d), `${d.weekStart} to ${d.weekEnd}`, previewBanner(preview && opts.hideTestBanner !== true), body);
}

/**
 * The exceptions report. Everyone who did NOT get a report, and why, plus any
 * error that broke the run. Kept apart from the clean report so that one stays
 * forwardable: a document that lists both the sent and the unsent cannot be
 * passed on without editing.
 */
export function formatExceptionsHtml(
  d: WeeklyDigest,
  opts: { preview?: boolean; hideTestBanner?: boolean } = {},
): string {
  const missed = missedDrivers(d, opts.preview === true);
  const td = `${CELL};font:14px/1.5 ${FONT};color:${INK}`;

  const errorBlock = d.errors.length
    ? `<div style="font:600 13px/1.4 ${FONT};color:${INK};margin:0 0 8px 0">Run errors</div>
       <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin-bottom:24px">
         ${d.errors.map((e) => `<tr><td style="${td};color:${BAD}">${esc(e)}</td></tr>`).join('')}
       </table>`
    : '';

  const rows = [...missed]
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
    .map(
      (dr) => `
      <tr>
        <td style="${td};white-space:nowrap">${esc(dr.displayName)}</td>
        <td style="${td};color:${BAD}">${esc(missReason(dr))}</td>
        <td style="${td};white-space:nowrap">${dr.phoneE164 ? esc(dr.phoneE164) : `<span style="color:${MUTED}">no phone</span>`}</td>
        <td style="${td};overflow-wrap:anywhere">${dr.email ? esc(dr.email) : `<span style="color:${MUTED}">no email</span>`}</td>
      </tr>`,
    )
    .join('');

  const body = missed.length
    ? `${errorBlock}
       <div style="font:600 13px/1.4 ${FONT};color:${INK};margin:0 0 8px 0">Did not receive a report (${missed.length})</div>
       <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse">
         <tr>${head('Driver')}${head('Why')}${head('Phone')}${head('Email')}</tr>
         ${rows}
       </table>`
    : `${errorBlock}<div style="font:14px/1.5 ${FONT};color:${GOOD}">Every driver received their report.</div>`;

  return shell(
    `${brand(d)}: exceptions`,
    `${d.weekStart} to ${d.weekEnd}`,
    previewBanner(opts.preview === true && opts.hideTestBanner !== true),
    body,
  );
}
