/**
 * Work out the inclusive YYYY-MM-DD window a Driver Fuel Performance export covers.
 *
 * The CSV has no date column. Two sources:
 *  1. Email subject, e.g. "Your Driver Fuel Performance - L1D Report for Sep 13 - Sep 14 is ready"
 *     for a "Last 24 Hours" daily schedule. The year is not in the subject, so it
 *     is inferred from the email's receivedDateTime.
 *  2. Manual export filename, e.g. wolverine_2026-07-01_2026-07-31.csv
 */

export type ReportGranularity = 'DAY' | 'WEEK' | 'MONTH' | 'CUSTOM';

export interface ReportWindow {
  windowStart: string; // inclusive
  windowEnd: string;   // inclusive
  granularity: ReportGranularity;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

function pad(n: number): string { return String(n).padStart(2, '0'); }
function ymd(y: number, m: number, d: number): string { return `${y}-${pad(m)}-${pad(d)}`; }

export function addDays(ymdStr: string, days: number): string {
  const [y, m, d] = ymdStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return ymd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

function isMonday(ymdStr: string): boolean {
  const [y, m, d] = ymdStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 1;
}

function isMonthStart(ymdStr: string): boolean { return ymdStr.endsWith('-01'); }
function isMonthEnd(ymdStr: string): boolean { return addDays(ymdStr, 1).endsWith('-01'); }

export function classifyWindow(windowStart: string, windowEnd: string): ReportGranularity {
  const span = daysBetween(windowStart, windowEnd);
  if (span === 0) return 'DAY';
  if (span === 6 && isMonday(windowStart)) return 'WEEK';
  if (isMonthStart(windowStart) && isMonthEnd(windowEnd) && windowStart.slice(0, 7) === windowEnd.slice(0, 7)) return 'MONTH';
  return 'CUSTOM';
}

export interface SubjectWindow extends ReportWindow {
  /** Window exactly as Motive labeled it. */
  labelStart: string;
  labelEnd: string;
  /** True when labelEnd equalled the delivery date and was trimmed off. */
  trimmedDeliveryDate: boolean;
}

const ET = 'America/New_York';

/** Calendar day (YYYY-MM-DD) in Eastern time for an instant. Motive labels are ET days. */
export function ymdInEastern(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: ET, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/**
 * Parse "... for Sep 13 - Sep 14 is ready" (or "Sep 13, 2026 - Sep 14, 2026").
 *
 * Motive's scheduled report is a nightly batch: the delivery day itself is
 * never populated, and the label lists calendar days inclusive of the delivery
 * day. So a "Last 24 Hours" file delivered on D is labeled "D-1 - D" and holds
 * D-1; a "Last 7 Days" file delivered on D is labeled "D-6 - D" and holds
 * D-6..D-1. Rule: if the label ends on the delivery date, trim that day off.
 * Verified against live files on 2026-09-14/18 (see memory notes).
 */
export function windowFromSubject(subject: string, receivedAt: Date): SubjectWindow | null {
  const m = subject.match(
    /for\s+([A-Za-z]{3,5})\.?\s+(\d{1,2})(?:,?\s*(\d{4}))?\s*-\s*([A-Za-z]{3,5})\.?\s+(\d{1,2})(?:,?\s*(\d{4}))?/
  );
  let labelStart: string;
  let labelEnd: string;
  if (!m) {
    const single = subject.match(/for\s+([A-Za-z]{3,5})\.?\s+(\d{1,2})(?:,?\s*(\d{4}))?\s+is ready/);
    if (!single) return null;
    const mon = MONTHS[single[1].toLowerCase()];
    if (!mon) return null;
    const y = single[3] ? Number(single[3]) : inferYear(mon, Number(single[2]), receivedAt);
    labelStart = labelEnd = ymd(y, mon, Number(single[2]));
  } else {
    const m1 = MONTHS[m[1].toLowerCase()];
    const m2 = MONTHS[m[4].toLowerCase()];
    if (!m1 || !m2) return null;
    const d1 = Number(m[2]);
    const d2 = Number(m[5]);
    const y2 = m[6] ? Number(m[6]) : inferYear(m2, d2, receivedAt);
    // Start year: if the range wraps a year boundary (Dec -> Jan), start is the prior year.
    const y1 = m[3] ? Number(m[3]) : (m1 > m2 ? y2 - 1 : y2);
    labelStart = ymd(y1, m1, d1);
    labelEnd = ymd(y2, m2, d2);
  }
  if (daysBetween(labelStart, labelEnd) < 0) return null;

  const deliveryDay = ymdInEastern(receivedAt);
  let windowEnd = labelEnd;
  let trimmed = false;
  if (labelEnd === deliveryDay) {
    windowEnd = addDays(labelEnd, -1);
    trimmed = true;
  }
  if (daysBetween(labelStart, windowEnd) < 0) return null; // label was only the delivery day
  return {
    windowStart: labelStart,
    windowEnd,
    granularity: classifyWindow(labelStart, windowEnd),
    labelStart,
    labelEnd,
    trimmedDeliveryDate: trimmed,
  };
}

/** Pick the year that puts (month, day) at or just before receivedAt. */
function inferYear(month: number, day: number, receivedAt: Date): number {
  const y = receivedAt.getUTCFullYear();
  const candidate = Date.UTC(y, month - 1, day);
  // A report received in early January for "Dec 31" belongs to the prior year.
  return candidate > receivedAt.getTime() + 2 * 86_400_000 ? y - 1 : y;
}

/** wolverine_2026-07-01_2026-07-31.csv → window; anything else → null. */
export function windowFromFilename(filename: string): ReportWindow | null {
  const base = filename.split('/').pop() ?? filename;
  const m = base.match(/(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})\.csv$/i);
  if (!m) return null;
  const [, start, end] = m;
  if (daysBetween(start, end) < 0) return null;
  return { windowStart: start, windowEnd: end, granularity: classifyWindow(start, end) };
}
