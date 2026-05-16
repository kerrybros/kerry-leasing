/**
 * ET-aware Monday-week date math for the weekly driver SMS report.
 *
 * "Last week" = the most recently completed Mon–Sun in America/New_York.
 * "Trailing 4 weeks" = the 4 most recently completed weeks, oldest → newest.
 *
 * Output dates are 'YYYY-MM-DD' strings matching the format used by all
 * Motive sync tables (single-day rows).
 */

const ET_TIMEZONE = 'America/New_York';

/** Returns { year, month, day, weekday } of `date` in America/New_York. weekday: 0=Sun..6=Sat */
function partsInEt(date: Date): { year: number; month: number; day: number; weekday: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: ET_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(date).map((p) => [p.type, p.value])
  ) as Record<string, string>;
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: parseInt(parts.year, 10),
    month: parseInt(parts.month, 10),
    day: parseInt(parts.day, 10),
    weekday: weekdayMap[parts.weekday] ?? 0,
  };
}

function fmtYmd(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Adds `days` calendar days to a YYYY-MM-DD string. Pure date math — no TZ involved. */
function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map((n) => parseInt(n, 10));
  // Construct at noon UTC to avoid any DST edge cases at midnight when adding days.
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  dt.setUTCDate(dt.getUTCDate() + days);
  return fmtYmd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export interface WeekRange {
  /** YYYY-MM-DD, Monday */
  startDate: string;
  /** YYYY-MM-DD, Sunday (inclusive) */
  endDate: string;
}

/**
 * Returns the most recently completed Mon–Sun (in ET) given `now`.
 * If `now` is on a Monday, returns the previous Mon..Sun.
 */
export function getLastWeekRange(now: Date = new Date()): WeekRange {
  const { year, month, day, weekday } = partsInEt(now);
  // Days since most recent Monday (Mon=1, Tue=2, … Sun=0 → 7)
  const daysSinceMonday = weekday === 0 ? 6 : weekday - 1;
  // Move back to *this* week's Monday, then go back another 7 days to land on last week's Monday.
  const todayYmd = fmtYmd(year, month, day);
  const thisMonday = addDays(todayYmd, -daysSinceMonday);
  const lastMonday = addDays(thisMonday, -7);
  const lastSunday = addDays(lastMonday, 6);
  return { startDate: lastMonday, endDate: lastSunday };
}

/**
 * Returns the 4 most recently completed weeks, oldest → newest.
 * The last element equals getLastWeekRange(now).
 */
export function getTrailing4WeekRanges(now: Date = new Date()): WeekRange[] {
  const last = getLastWeekRange(now);
  const weeks: WeekRange[] = [last];
  for (let i = 1; i < 4; i++) {
    const prev = weeks[0];
    const earlierMonday = addDays(prev.startDate, -7);
    const earlierSunday = addDays(earlierMonday, 6);
    weeks.unshift({ startDate: earlierMonday, endDate: earlierSunday });
  }
  return weeks;
}

/** Today's date in ET as YYYY-MM-DD — handy for logging. */
export function todayInEt(now: Date = new Date()): string {
  const { year, month, day } = partsInEt(now);
  return fmtYmd(year, month, day);
}

/** Current ET hour 0..23 — used by the orchestrator to filter orgs by sendHourEt. */
export function currentHourInEt(now: Date = new Date()): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: ET_TIMEZONE,
    hour: 'numeric',
    hourCycle: 'h23',
  });
  return parseInt(fmt.format(now), 10);
}
