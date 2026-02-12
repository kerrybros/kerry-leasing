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

export function getYesterday(_timezone: string = 'America/Toronto'): string {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  return yesterday.toISOString().split('T')[0];
}

export function getTwoDaysAgo(_timezone: string = 'America/Toronto'): string {
  const now = new Date();
  const twoDaysAgo = new Date(now);
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
  return twoDaysAgo.toISOString().split('T')[0];
}

export function getThreeDaysAgo(_timezone: string = 'America/Toronto'): string {
  const now = new Date();
  const d = new Date(now);
  d.setDate(d.getDate() - 3);
  return d.toISOString().split('T')[0];
}

export function getDateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const current = new Date(startDate);
  const end = new Date(endDate);
  while (current <= end) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }
  return dates;
}
