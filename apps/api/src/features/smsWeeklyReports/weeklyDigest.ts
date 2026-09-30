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

/** A driver on their first week of data has nothing to compare against yet. */
function isNew(d: WeeklyDigestDriver): boolean {
  return d.weeksOfData <= 1;
}

export function buildWeeklyDigest(results: SendOrgResult[]): WeeklyDigest {
  const drivers = results.flatMap((r) => r.digest);
  return {
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
    row('Drivers reported', current.drivers, previous?.drivers ?? null, (v) => num(v), false),
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

export function formatWeeklyDigestSubject(d: WeeklyDigest, opts: { preview?: boolean } = {}): string {
  // A preview has sent nothing by definition, so reporting "0 sent" would read
  // as a catastrophe rather than as a dry run.
  const parts = [opts.preview ? `${d.drivers.length} would send` : `${d.sentCount} sent`];
  if (d.failedCount > 0) parts.push(`${d.failedCount} failed`);
  if (d.notSentCount > 0) parts.push(`${d.notSentCount} not sent`);
  if (d.errors.length > 0) parts.push(`${d.errors.length} run error${d.errors.length === 1 ? '' : 's'}`);
  return `Driver reports ${d.weekStart} to ${d.weekEnd}: ${parts.join(', ')}`;
}

export function formatWeeklyDigestText(d: WeeklyDigest): string {
  const lines: string[] = [`Week ${d.weekStart} to ${d.weekEnd}`];
  lines.push(`${d.sentCount} sent, ${d.failedCount} failed, ${d.notSentCount} not sent.`);
  if (d.errors.length > 0) {
    lines.push('', 'RUN ERRORS');
    for (const e of d.errors) lines.push(`  ${e}`);
  }
  const fleet = buildFleetRows(d.fleet.current, d.fleet.previous);
  if (fleet.length > 0) {
    lines.push('', 'FLEET TOTALS (this week / last week / change)');
    for (const r of fleet) lines.push(`  ${r.label}: ${r.current} / ${r.previous} ${r.change}`);
  }
  lines.push('', `DRIVERS (${d.drivers.length})`);
  for (const dr of [...d.drivers].sort((a, b) => b.score - a.score)) {
    const chans = dr.channels.length
      ? dr.channels.map((c) => `${c.channel}:${c.status}`).join(' ')
      : `NOT SENT (${dr.suppressedReason ?? 'no reason recorded'})`;
    const delta = isNew(dr) ? 'new' : `${signed(dr.scoreVsAvg, 0)} vs avg`;
    lines.push(
      `  ${dr.displayName}: score ${dr.score.toFixed(0)}, idle ${dr.idlePct.toFixed(1)}%, ${delta}, ` +
        `units ${dr.vehicles.join('/') || '-'}, ${chans}`,
    );
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// HTML rendering
//
// Email clients render a text body in a proportional font, which collapses the
// column padding of the plain-text table into an unreadable mess. So the real
// digest is an HTML table. Inline styles only, table layout, no web fonts and
// no modern CSS: Outlook strips stylesheets and does not do flexbox or grid.
// The text version above stays as the fallback body.
// ---------------------------------------------------------------------------

const INK = '#1a1a1a';
const MUTED = '#6b7280';
const RULE = '#e5e7eb';
const GOOD = '#047857';
const WARN = '#b45309';
const BAD = '#b91c1c';
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

function deltaCell(d: WeeklyDigestDriver): string {
  if (isNew(d)) return `<span style="color:${MUTED}">new</span>`;
  if (Math.abs(d.scoreVsAvg) < 1) return `<span style="color:${MUTED}">level</span>`;
  return `<span style="color:${d.scoreVsAvg > 0 ? GOOD : BAD}">${signed(d.scoreVsAvg, 0)}</span>`;
}

function statusCell(d: WeeklyDigestDriver, preview: boolean): string {
  if (d.channels.length === 0) {
    return `<span style="color:${BAD}">not sent: ${esc(d.suppressedReason ?? 'no reason recorded')}</span>`;
  }
  if (preview) return `<span style="color:${MUTED}">would send</span>`;
  return d.channels
    .map((c) => {
      const failed = c.status === 'FAILED';
      const color = failed ? BAD : c.status === 'DELIVERED' ? GOOD : MUTED;
      const label = failed ? `${c.channel} FAILED` : `${c.channel} ${String(c.status).toLowerCase()}`;
      return `<span style="color:${color}">${esc(label)}</span>`;
    })
    .join('<br>');
}

function fleetTable(d: WeeklyDigest): string {
  const rows = buildFleetRows(d.fleet.current, d.fleet.previous);
  if (rows.length === 0) return '';
  const th = `font:600 11px/1.2 ${FONT};color:${MUTED};text-transform:uppercase;letter-spacing:.04em;padding:0 10px 6px 0;border-bottom:1px solid ${RULE}`;
  const td = `font:14px/1.5 ${FONT};color:${INK};padding:7px 10px 7px 0;border-bottom:1px solid #f3f4f6`;
  const body = rows
    .map((r) => {
      const color = r.tone === 'good' ? GOOD : r.tone === 'bad' ? BAD : MUTED;
      return `<tr>
        <td style="${td}">${esc(r.label)}</td>
        <td style="${td};text-align:right;font-weight:600">${esc(r.current)}</td>
        <td style="${td};text-align:right;color:${MUTED}">${esc(r.previous)}</td>
        <td style="${td};text-align:right;color:${color}">${esc(r.change)}</td>
      </tr>`;
    })
    .join('');
  return `
    <div style="font:600 13px/1.4 ${FONT};color:${INK};margin:4px 0 8px 0">Fleet totals</div>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin-bottom:26px">
      <tr>
        <th align="left" style="${th}"></th>
        <th align="right" style="${th}">This week</th>
        <th align="right" style="${th}">Last week</th>
        <th align="right" style="${th}">Change</th>
      </tr>
      ${body}
    </table>`;
}

export function formatWeeklyDigestHtml(d: WeeklyDigest, opts: { preview?: boolean } = {}): string {
  const preview = opts.preview === true;
  const th = `font:600 11px/1.2 ${FONT};color:${MUTED};text-transform:uppercase;letter-spacing:.04em;padding:0 8px 6px 0;border-bottom:1px solid ${RULE}`;
  const td = `font:14px/1.5 ${FONT};color:${INK};padding:7px 8px 7px 0;border-bottom:1px solid #f3f4f6`;

  const rows = [...d.drivers]
    .sort((a, b) => b.score - a.score)
    .map(
      (dr) => `
      <tr>
        <td style="${td}">${esc(dr.displayName)}${isNew(dr) ? ` <span style="font-size:11px;color:${MUTED}">NEW</span>` : ''}</td>
        <td style="${td};text-align:right;font-weight:600;color:${scoreColor(dr.score)}">${dr.score.toFixed(0)}</td>
        <td style="${td};text-align:right">${deltaCell(dr)}</td>
        <td style="${td};text-align:right">${dr.idlePct.toFixed(1)}%</td>
        <td style="${td};text-align:right">${num(dr.totalMiles)}</td>
        <td style="${td};color:${MUTED}">${dr.vehicles.length ? esc(dr.vehicles.join(', ')) : '&mdash;'}</td>
        <td style="${td}">${statusCell(dr, preview)}</td>
      </tr>`,
    )
    .join('');

  const headline = preview
    ? `${d.drivers.length} driver${d.drivers.length === 1 ? '' : 's'} would receive a report`
    : `${d.sentCount} driver${d.sentCount === 1 ? '' : 's'} received a report`;
  const problems: string[] = [];
  if (d.failedCount > 0) problems.push(`${d.failedCount} failed`);
  if (d.notSentCount > 0) problems.push(`${d.notSentCount} not sent`);

  // Only shown when the run itself broke. Not a judgement about the numbers,
  // which is why it survives where the old "worth a look" section did not: a
  // run that failed is a fact, and hiding it would make a broken week look calm.
  const errorBox = d.errors.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 20px 0;border-collapse:collapse">
        <tr><td style="border-left:3px solid ${BAD};padding:10px 14px;background:#fafafa">
          <div style="font:600 13px/1.4 ${FONT};color:${INK};margin-bottom:6px">Run errors</div>
          ${d.errors.map((e) => `<div style="font:14px/1.6 ${FONT};color:${INK}">${esc(e)}</div>`).join('')}
        </td></tr>
      </table>`
    : '';

  return `<!doctype html><html><body style="margin:0;padding:0;background:#ffffff">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#ffffff">
   <tr><td align="center" style="padding:24px 16px">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:720px;text-align:left">
      <tr><td>
        ${preview ? `<div style="font:600 13px/1.5 ${FONT};color:${WARN};border:1px solid ${WARN};padding:8px 12px;margin-bottom:18px">TEST PREVIEW. Nothing was sent to any driver.</div>` : ''}
        <div style="font:600 19px/1.3 ${FONT};color:${INK}">Weekly driver reports</div>
        <div style="font:14px/1.5 ${FONT};color:${MUTED};margin:2px 0 18px 0">${esc(d.weekStart)} to ${esc(d.weekEnd)}</div>
        <div style="font:15px/1.5 ${FONT};color:${INK};margin-bottom:22px">
          ${esc(headline)}${problems.length ? `, <span style="color:${BAD}">${esc(problems.join(', '))}</span>` : ''}.
        </div>
        ${errorBox}
        ${fleetTable(d)}
        <div style="font:600 13px/1.4 ${FONT};color:${INK};margin:4px 0 8px 0">Drivers (${d.drivers.length})</div>
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse">
          <tr>
            <th align="left" style="${th}">Driver</th>
            <th align="right" style="${th}">Score</th>
            <th align="right" style="${th}">vs avg</th>
            <th align="right" style="${th}">Idle</th>
            <th align="right" style="${th}">Miles</th>
            <th align="left" style="${th}">Units</th>
            <th align="left" style="${th}">Status</th>
          </tr>
          ${rows}
        </table>
        <div style="font:12px/1.5 ${FONT};color:${MUTED};margin-top:16px">
          Score combines idle, MPG and safety. "vs avg" compares this week's score with that driver's own trailing four week average.
        </div>
      </td></tr>
    </table>
   </td></tr>
  </table>
  </body></html>`;
}
