/**
 * Decide whether a [startDate, endDate] range can be served entirely from
 * ingested Motive report windows, and which windows tile it.
 *
 * Rule: the range must be covered EXACTLY by non-overlapping ingested windows
 * (daily files, Monday..Sunday weekly exports, monthly exports, or any custom
 * range) laid end to end with no gap. If it cannot, the caller falls back to
 * the API tables for the WHOLE range: Motive support explicitly said not to mix
 * API and report figures, so a range is all-report or all-API, never a blend.
 *
 * Tiling is greedy from the start date, always taking the ingested window that
 * starts at the cursor and reaches furthest without passing endDate. So when a
 * week exists both as seven daily files and one weekly export, the weekly
 * export wins (it includes Motive's retroactive edits).
 */

import { getAppPrisma } from '../../lib/prisma.js';
import { addDays } from './reportWindow.js';

export interface ReportCoverage {
  windows: Array<{ windowStart: string; windowEnd: string }>;
}

export function tileRange(
  startDate: string,
  endDate: string,
  available: Array<{ windowStart: string; windowEnd: string }>
): ReportCoverage | null {
  if (startDate > endDate) return null;
  const byStart = new Map<string, string[]>();
  for (const w of available) {
    if (w.windowStart < startDate || w.windowEnd > endDate) continue;
    const arr = byStart.get(w.windowStart) ?? [];
    arr.push(w.windowEnd);
    byStart.set(w.windowStart, arr);
  }
  const chosen: ReportCoverage['windows'] = [];
  let cursor = startDate;
  while (cursor <= endDate) {
    const ends = byStart.get(cursor);
    if (!ends || ends.length === 0) return null;
    const best = ends.reduce((a, b) => (b > a ? b : a));
    chosen.push({ windowStart: cursor, windowEnd: best });
    cursor = addDays(best, 1);
  }
  return { windows: chosen };
}

export async function resolveReportCoverage(
  clerkOrgId: string,
  startDate: string,
  endDate: string
): Promise<ReportCoverage | null> {
  const prisma = getAppPrisma();
  const ingests = await prisma.motiveReportIngest.findMany({
    where: { clerkOrgId, status: 'ACCEPTED', windowStart: { gte: startDate }, windowEnd: { lte: endDate } },
    select: { windowStart: true, windowEnd: true },
    distinct: ['windowStart', 'windowEnd'],
  });
  if (ingests.length === 0) return null;
  return tileRange(startDate, endDate, ingests);
}

/** Cache-busting token: changes whenever a new report file lands for the org. */
export async function latestReportIngestToken(clerkOrgId: string): Promise<string> {
  const prisma = getAppPrisma();
  const latest = await prisma.motiveReportIngest.findFirst({
    where: { clerkOrgId, status: 'ACCEPTED' },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  return latest ? String(latest.createdAt.getTime()) : 'none';
}

/**
 * Coverage for a range using ONLY single-day report files.
 *
 * The greedy tiler deliberately prefers the widest window available, because a
 * weekly or monthly export carries Motive's retroactive edits. That is right
 * for a total, and wrong for anything that needs a value PER DAY: a week-long
 * file cannot be split back into days.
 *
 * The drivers page needs per-day rows, and it used to accept the normal tiling
 * and then check whether every window happened to be one day. Once weekly and
 * monthly files existed for a period, that check failed and the whole range
 * silently dropped to the API, which is the source that under-counts low speed
 * driving and inflates idle on yard trucks by 20 to 30 points. The 90 day
 * backfill made it worse, because more files meant wider tiles were chosen.
 *
 * So ask the question directly: is every day in this range covered by its own
 * daily file? If any day is missing, return null and let the caller fall back
 * honestly rather than serve a mix.
 *
 * UNVERIFIED days count here, and only here. A day is marked UNVERIFIED when
 * Motive's report omits a driver the API says worked, which over 15 months of
 * backfill happened on 5 days out of 365. Excluding them would drop any range
 * spanning one back to the API, making idle wrong for EVERY driver in it to
 * avoid one driver missing a single row: about 0.05% of driver-days traded for
 * 100% of them. The scorecard and the weekly send still demand ACCEPTED, since
 * there a missing driver changes what someone is told about themselves.
 */
export async function resolveDailyReportCoverage(
  clerkOrgId: string,
  startDate: string,
  endDate: string
): Promise<ReportCoverage | null> {
  if (startDate > endDate) return null;
  const prisma = getAppPrisma();
  const ingests = await prisma.motiveReportIngest.findMany({
    where: {
      clerkOrgId,
      status: { in: ['ACCEPTED', 'UNVERIFIED'] },
      granularity: 'DAY',
      windowStart: { gte: startDate, lte: endDate },
    },
    select: { windowStart: true, windowEnd: true },
    distinct: ['windowStart'],
  });
  const have = new Set(ingests.filter((i) => i.windowStart === i.windowEnd).map((i) => i.windowStart));
  const windows: ReportCoverage['windows'] = [];
  for (let d = startDate; d <= endDate; d = addDays(d, 1)) {
    if (!have.has(d)) return null;
    windows.push({ windowStart: d, windowEnd: d });
  }
  return { windows };
}
