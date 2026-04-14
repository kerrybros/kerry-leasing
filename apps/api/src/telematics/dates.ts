/**
 * SHARED TELEMATICS DATE HELPERS
 * Used by both Motive and Samsara sync and cron.
 * Timezone defaults to America/Toronto for consistent day boundaries.
 */

const EST_TZ = 'America/New_York';

/**
 * Return UTC start and end (RFC 3339) for the full calendar day in EST (America/New_York).
 * Used by Samsara so we pull one full EST day, not UTC day.
 * @param date - YYYY-MM-DD (calendar day in EST)
 */
export function getESTDayBounds(date: string): { startTime: string; endTime: string } {
  const [y, m, d] = date.split('-').map(Number);
  const month = m - 1; // 0-indexed
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: EST_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const targetDate = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  let startUTC: number | null = null;
  let endUTC: number | null = null;
  // Search UTC day before and day of (EST midnight can be 04:00-05:00 UTC next calendar day in winter)
  for (let dayOffset = -1; dayOffset <= 1; dayOffset++) {
    for (let hour = 0; hour < 24; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        const utc = Date.UTC(y, month, d + dayOffset, hour, minute, 0, 0);
        const parts = formatter.formatToParts(new Date(utc));
        const part = (k: string) => parts.find((p) => p.type === k)?.value ?? '';
        const nyDate = `${part('year')}-${part('month')}-${part('day')}`;
        const nyHour = part('hour');
        const nyMinute = part('minute');
        if (nyDate === targetDate && nyHour === '00' && nyMinute === '00') {
          if (startUTC === null) startUTC = utc;
          endUTC = utc; // keep updating to last moment that is still midnight
        }
      }
    }
  }
  if (startUTC === null) {
    throw new Error(`Could not resolve EST midnight for ${date}`);
  }
  // End of day = start of next day in EST minus 1 ms
  const nextDay = new Date(startUTC);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  for (let hour = 0; hour < 24; hour++) {
    for (let minute = 0; minute < 60; minute += 30) {
      const utc = Date.UTC(
        nextDay.getUTCFullYear(),
        nextDay.getUTCMonth(),
        nextDay.getUTCDate(),
        hour,
        minute,
        0,
        0
      );
      const parts = formatter.formatToParts(new Date(utc));
      const part = (k: string) => parts.find((p) => p.type === k)?.value ?? '';
      const nyDate = `${part('year')}-${part('month')}-${part('day')}`;
      const nyHour = part('hour');
      const nyMinute = part('minute');
      if (nyDate !== targetDate && nyHour === '00' && nyMinute === '00') {
        endUTC = utc - 1;
        break;
      }
    }
    if (endUTC !== null && endUTC !== startUTC) break;
  }
  if (endUTC === null || endUTC === startUTC) {
    endUTC = startUTC + 24 * 60 * 60 * 1000 - 1; // fallback: 24h - 1ms
  }
  const startTime = new Date(startUTC).toISOString().slice(0, 19) + 'Z';
  const endTime = new Date(endUTC).toISOString().slice(0, 19).replace('T', 'T');
  const endTimeMs = new Date(endUTC).toISOString();
  const endWithMs = endTimeMs.includes('.') ? endTimeMs : endTime + '.000Z';
  return {
    startTime: startTime.replace('T', 'T'),
    endTime: endWithMs.endsWith('Z') ? endWithMs : endWithMs + 'Z',
  };
}

/**
 * Return the current calendar date in Eastern Time as YYYY-MM-DD.
 * Uses Intl.DateTimeFormat to resolve the correct Eastern date regardless of
 * server timezone, including across DST transitions.
 */
function getEasternDate(): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: EST_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date());
}

export function getYesterday(): string {
  const [y, m, d] = getEasternDate().split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d - 1));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function getTwoDaysAgo(): string {
  const [y, m, d] = getEasternDate().split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d - 2));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function getThreeDaysAgo(): string {
  const [y, m, d] = getEasternDate().split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d - 3));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/**
 * Return the RFC 3339 date string with EST/EDT offset for a given YYYY-MM-DD.
 * e.g. "2026-02-03T00:00:00-05:00" (EST) or "2026-06-15T00:00:00-04:00" (EDT)
 * Used for Samsara report endpoints that accept date+timezone but ignore time.
 */
export function getESTDateString(date: string): string {
  const { startTime } = getESTDayBounds(date);
  // startTime is midnight EST expressed as UTC (e.g. "2026-02-03T05:00:00Z")
  // The UTC hour tells us the offset: 5 → EST (-05:00), 4 → EDT (-04:00)
  const utcHour = parseInt(startTime.substring(11, 13), 10);
  const offset = `-${String(utcHour).padStart(2, '0')}:00`;
  return `${date}T00:00:00${offset}`;
}

/** Inclusive start and end (YYYY-MM-DD). Uses UTC date parts to avoid DST/Timezone duplicates or gaps. */
export function getDateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const [sy, sm, sd] = startDate.split('-').map(Number);
  const [ey, em, ed] = endDate.split('-').map(Number);
  let y = sy;
  let m = sm;
  let d = sd;
  const toStr = (yy: number, mm: number, dd: number) =>
    `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  while (y < ey || (y === ey && m < em) || (y === ey && m === em && d <= ed)) {
    dates.push(toStr(y, m, d));
    d += 1;
    if (d > new Date(y, m, 0).getDate()) {
      d = 1;
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }
  }
  return dates;
}
