/**
 * IS THE REPORT WEEK COMPLETE ENOUGH TO FREEZE?
 *
 * `prepare` locks the week down: whatever it freezes is what every driver gets
 * hours later, and dispatch may not recompute it. So freezing early is only
 * safe when the week's data is actually settled.
 *
 * It usually is, because the week closed on Sunday and this runs on Tuesday.
 * But Motive attributes driving to a driver days after the fact. On 2026-10-13
 * the file for Sunday 10-11 went from 5 drivers to 6 between Monday's pull and
 * Tuesday's: Jamie Shell, 271 miles. A freeze taken before that pull would have
 * sent him a card missing a day, and the operator report would have matched the
 * card while both disagreed with Motive.
 *
 * Two things are checked, and both are about OUR copy of the week rather than
 * Motive's opinion of it:
 *
 *  - every day of the week has a stored daily report file. A missing day means
 *    the week cannot be tiled and the figures would silently be short.
 *  - no day is UNVERIFIED. The portal pull marks a window UNVERIFIED when a
 *    driver the API shows driving is absent from the report file, which is the
 *    signature of a batch that has not finished landing.
 *
 * Not ready is not an error. The caller holds the freeze, says so, and the
 * ordinary one-pass send still runs later, which is exactly today's behaviour.
 */

import { getAppPrisma } from '../../lib/prisma.js';
import { addDays } from '../motiveReport/reportWindow.js';

export interface WeekReadiness {
  ready: boolean;
  weekStart: string;
  weekEnd: string;
  /** Days of the week with no stored daily report file at all. */
  missingDays: string[];
  /** Days stored but flagged as incomplete by the pull's driver-presence check. */
  unverifiedDays: string[];
  /** One line fit for an alert email, or null when ready. */
  reason: string | null;
}

function daysInWeek(weekStart: string, weekEnd: string): string[] {
  const out: string[] = [];
  for (let d = weekStart; d <= weekEnd; d = addDays(d, 1)) out.push(d);
  return out;
}

/** One stored daily report file, as the readiness rules care about it. */
export interface DayIngest {
  windowStart: string;
  windowEnd: string;
  status: string;
}

/**
 * The rule itself, separated from the query so it can be tested directly.
 *
 * Several pulls of the same day are normal: the nightly job re-pulls a rolling
 * window. A day counts as verified when ANY pull accepted it, so an early
 * UNVERIFIED that a later pull cleared does not hold the week back.
 */
export function classifyWeekReadiness(
  weekStart: string,
  weekEnd: string,
  rows: DayIngest[],
): WeekReadiness {
  const byDay = new Map<string, string>();
  for (const r of rows) {
    if (r.windowStart !== r.windowEnd) continue; // only whole-day files tile a week
    if (byDay.get(r.windowStart) === 'ACCEPTED') continue;
    byDay.set(r.windowStart, r.status);
  }

  const missingDays: string[] = [];
  const unverifiedDays: string[] = [];
  for (const day of daysInWeek(weekStart, weekEnd)) {
    const status = byDay.get(day);
    if (status === undefined) missingDays.push(day);
    else if (status !== 'ACCEPTED') unverifiedDays.push(day);
  }

  const parts: string[] = [];
  if (missingDays.length > 0) parts.push(`no report file for ${missingDays.join(', ')}`);
  if (unverifiedDays.length > 0) {
    parts.push(
      `report incomplete for ${unverifiedDays.join(', ')} (a driver the API shows driving is missing)`,
    );
  }

  return {
    ready: parts.length === 0,
    weekStart,
    weekEnd,
    missingDays,
    unverifiedDays,
    reason: parts.length === 0 ? null : parts.join('; '),
  };
}

export async function checkWeekReadiness(
  clerkOrgId: string,
  weekStart: string,
  weekEnd: string,
): Promise<WeekReadiness> {
  const rows = await getAppPrisma().motiveReportIngest.findMany({
    where: {
      clerkOrgId,
      granularity: 'DAY',
      windowStart: { gte: weekStart, lte: weekEnd },
    },
    select: { windowStart: true, windowEnd: true, status: true },
  });
  return classifyWeekReadiness(weekStart, weekEnd, rows);
}
