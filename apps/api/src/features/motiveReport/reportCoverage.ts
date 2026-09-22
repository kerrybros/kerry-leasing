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
