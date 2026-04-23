/**
 * revenue_details.date_action_completed is a freeform string, commonly:
 * "8:21AM 2/2/2026" (12h time + space + M/D/YYYY) or a bare M/D/YYYY.
 * We only need the calendar date; time is ignored except that it may precede the date.
 * DB may store plain ISO "YYYY-MM-DD", freeform "8:21AM 2/2/2026", or "2-2-2026" (M-D-Y with dashes).
 * Aggregated per job (max date), that value is the order closed date (`orderClosedDate` in the API).
 */

const ISO_YMD = /(\d{4})-(\d{2})-(\d{2})/g;
const MDY_SLASH = /(\d{1,2})\/(\d{1,2})\/(\d{4})/g;
/** M-D-YYYY with dashes (US); distinct from ISO because year is last. */
const MDY_DASH = /(\d{1,2})-(\d{1,2})-(\d{4})/g;

function mdyToYmd(month: number, day: number, year: number): string | null {
  if (year < 1990 || year > 2100) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * @returns YYYY-MM-DD in America-local calendar sense, or null if unparseable
 */
export function parseDateActionCompletedToYmd(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;

  // 1) Plain or embedded ISO dates (common when stored as "2026-01-15" or "...2026-01-15T12:00:00Z")
  let bestIso: string | null = null;
  for (const m of s.matchAll(ISO_YMD)) {
    const year = parseInt(m[1]!, 10);
    const month = parseInt(m[2]!, 10);
    const day = parseInt(m[3]!, 10);
    const ymd = mdyToYmd(month, day, year);
    if (ymd) bestIso = ymdMax(bestIso, ymd);
  }
  if (bestIso) return bestIso;

  // 2) Last M/D/YYYY in the string (handles "8:21AM 2/2/2026" and weird prefixes)
  let lastSlash: RegExpMatchArray | null = null;
  for (const m of s.matchAll(MDY_SLASH)) {
    lastSlash = m;
  }
  if (lastSlash) {
    const ymd = mdyToYmd(
      parseInt(lastSlash[1]!, 10),
      parseInt(lastSlash[2]!, 10),
      parseInt(lastSlash[3]!, 10)
    );
    if (ymd) return ymd;
  }

  // 3) Last M-D-YYYY (dashes, year last)
  let lastDash: RegExpMatchArray | null = null;
  for (const m of s.matchAll(MDY_DASH)) {
    lastDash = m;
  }
  if (lastDash) {
    return mdyToYmd(
      parseInt(lastDash[1]!, 10),
      parseInt(lastDash[2]!, 10),
      parseInt(lastDash[3]!, 10)
    );
  }

  return null;
}

/** Latest date by ISO Y-M-D string order (valid for same calendar) */
export function ymdMax(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a >= b ? a : b;
}
