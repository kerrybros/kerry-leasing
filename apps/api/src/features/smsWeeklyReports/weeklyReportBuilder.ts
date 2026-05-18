/**
 * Weekly report builder — for one org, fetches the last week + 4 trailing
 * weeks of scorecard data and produces a per-driver report object ready
 * for SMS formatting + public-page rendering.
 *
 * Reuses TelematicsService.getDriverScorecard for aggregation — does NOT
 * recompute idle/MPG/score logic. Only joins to DriverContact + computes
 * rank, tier, 4-week trend, and coaching tips.
 */

import { TelematicsService, type ScorecardDriver } from '../../services/telematicsService.js';
import { getAppPrisma } from '../../lib/prisma.js';
import { DriverContactSource } from '../../generated/app-client/index.js';
import { getLastWeekRange, getTrailing4WeekRanges, type WeekRange } from './dateWindow.js';
import { loadExcludedMotiveDriverIds } from '../drivers/excludedDrivers.js';

export interface WeeklyKpiTrendPoint {
  weekStart: string;
  score: number;
  idlePct: number;
  avgMpg: number;
  totalMiles: number;
  hardEvents: number;
  idleFuelGal: number;
  totalFuelGal: number;
}

export interface DriverWeeklyReport {
  driverContactId: string;       // empty string for drivers without a DriverContact row (shouldn't happen)
  motiveDriverId: number;
  displayName: string;
  firstName: string;
  phoneE164: string | null;
  enrolled: boolean;
  optedOut: boolean;
  noActivity: boolean;

  // Current week
  current: ScorecardDriver;
  rank: number;
  totalDrivers: number;
  fleetAvgMpg: number;

  // 4-week trend (oldest → newest, length up to 4)
  trend: WeeklyKpiTrendPoint[];
  trailing4WeekAvg: {
    idlePct: number;
    avgMpg: number;
    hardEvents: number;
    totalMiles: number;
    idleFuelGal: number;
    score: number;
  };
  diffVsAvg: {
    idlePctPts: number;     // current minus avg
    avgMpg: number;
    hardEvents: number;
    score: number;
  };
}

export interface BuildWeeklyReportsResult {
  orgId: string;
  weekStart: string;
  weekEnd: string;
  fleetAvgMpg: number;
  reports: DriverWeeklyReport[];
  unmatchedDriverNames: string[];   // Motive driver names with no DriverContact row at start
}

const telematics = new TelematicsService();

function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] || displayName;
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Build all weekly reports for an org. Also reconciles DriverContact by
 * upserting rows for any Motive driver names that don't yet have one.
 */
export async function buildWeeklyReports(orgId: string, now: Date = new Date()): Promise<BuildWeeklyReportsResult> {
  const prisma = getAppPrisma();
  const last = getLastWeekRange(now);
  const trailing = getTrailing4WeekRanges(now);

  // Fetch this week + 4 prior weeks of scorecards in parallel.
  const [currentRaw, ...trendWeeksRaw] = await Promise.all([
    telematics.getDriverScorecard(orgId, last.startDate, last.endDate),
    ...trailing.slice(0, 3).map((w: WeekRange) =>
      telematics.getDriverScorecard(orgId, w.startDate, w.endDate)
    ),
    // trailing[3] (newest) is the same window as `current`; reuse below
  ]);

  // Exclude drivers an admin has hidden from the portal. Filter into NEW
  // objects — getDriverScorecard's result may be cached, so we must not
  // mutate it. `current` is re-ranked so the SMS leaderboard stays dense.
  const excluded = await loadExcludedMotiveDriverIds(prisma, orgId);
  const current = excluded.size > 0
    ? {
        ...currentRaw,
        data: currentRaw.data
          .filter(d => !excluded.has(d.driverId))
          .map((d, idx) => ({ ...d, rank: idx + 1 })),
      }
    : currentRaw;
  const trendWeeks = excluded.size > 0
    ? trendWeeksRaw.map(w => (w ? { ...w, data: w.data.filter(d => !excluded.has(d.driverId)) } : w))
    : trendWeeksRaw;

  // trailing weeks oldest→newest, with the newest being `current`
  const trendOldestToNewest: { week: WeekRange; rows: ScorecardDriver[] }[] = [
    { week: trailing[0], rows: trendWeeks[0]?.data ?? [] },
    { week: trailing[1], rows: trendWeeks[1]?.data ?? [] },
    { week: trailing[2], rows: trendWeeks[2]?.data ?? [] },
    { week: trailing[3], rows: current.data },
  ];

  const totalDrivers = current.data.length;

  // Load all DriverContact rows for the org once
  const contacts = await prisma.driverContact.findMany({
    where: { clerkOrgId: orgId },
    select: {
      id: true,
      displayName: true,
      normalizedName: true,
      email: true,
      phoneE164: true,
      motiveDriverId: true,
      enrolled: true,
      optedOut: true,
    },
  });
  const byNorm = new Map(contacts.map((c) => [c.normalizedName, c]));
  const byMotiveId = new Map(contacts.filter((c) => c.motiveDriverId != null).map((c) => [c.motiveDriverId!, c]));

  // Pull last-week emails from MotiveDriverUtilization so we can populate email
  // when lazy-creating contacts (Motive scorecard doesn't include email).
  const motiveDriverInfo = await prisma.motiveDriverUtilization.findMany({
    where: { clerkOrgId: orgId, date: { gte: last.startDate, lte: last.endDate }, driverId: { not: null } },
    select: { driverId: true, driverEmail: true },
    distinct: ['driverId'],
  });
  const emailByMotiveId = new Map<number, string | null>();
  for (const r of motiveDriverInfo) {
    if (r.driverId != null) emailByMotiveId.set(r.driverId, r.driverEmail?.trim().toLowerCase() || null);
  }

  // Reconcile: insert any Motive driver names missing from DriverContact
  const unmatchedDriverNames: string[] = [];
  for (const row of current.data) {
    const matchedByName = byNorm.get(normalizeName(row.driverName));
    const matchedById = byMotiveId.get(row.driverId);
    if (matchedByName || matchedById) {
      // If we matched by name but motiveDriverId is null, backfill it.
      if (matchedByName && !matchedByName.motiveDriverId) {
        await prisma.driverContact.update({
          where: { id: matchedByName.id },
          data: { motiveDriverId: row.driverId },
        });
        matchedByName.motiveDriverId = row.driverId;
        byMotiveId.set(row.driverId, matchedByName as any);
      }
      continue;
    }
    // No match — create
    unmatchedDriverNames.push(row.driverName);
    try {
      const created = await prisma.driverContact.create({
        data: {
          clerkOrgId: orgId,
          displayName: row.driverName,
          normalizedName: normalizeName(row.driverName),
          email: emailByMotiveId.get(row.driverId) ?? null,
          motiveDriverId: row.driverId,
          source: DriverContactSource.MOTIVE_AUTO,
          enrolled: true,
          optedOut: false,
        },
        select: {
          id: true,
          displayName: true,
          normalizedName: true,
          email: true,
          phoneE164: true,
          motiveDriverId: true,
          enrolled: true,
          optedOut: true,
        },
      });
      byNorm.set(created.normalizedName, created);
      byMotiveId.set(created.motiveDriverId!, created);
    } catch (err: any) {
      // Unique constraint race — fetch and continue
      console.warn(`[smsWeeklyReports] Failed to upsert DriverContact for ${row.driverName}:`, err.message);
    }
  }

  const reports: DriverWeeklyReport[] = current.data.map((row, idx) => {
    // Scorecard service already returns drivers in score-desc order, so
    // idx+1 is the Motive-wide rank. We overwrite this below with a
    // re-rank that only counts reachable drivers.
    const rank = idx + 1;
    const contact = byMotiveId.get(row.driverId) ?? byNorm.get(normalizeName(row.driverName));

    // Build trend from each week's data (oldest → newest)
    const trend: WeeklyKpiTrendPoint[] = trendOldestToNewest.map(({ week, rows }) => {
      const r = rows.find((x) => x.driverId === row.driverId);
      return {
        weekStart: week.startDate,
        score: r?.score ?? 0,
        idlePct: r?.idlePct ?? 0,
        avgMpg: r?.avgMpg ?? 0,
        totalMiles: r?.totalMiles ?? 0,
        hardEvents: r?.hardEvents ?? 0,
        idleFuelGal: r?.idleFuelGal ?? 0,
        totalFuelGal: r?.totalFuelGal ?? 0,
      };
    });

    // 4-week averages — only count weeks with any activity (totalMiles > 0) to avoid skew from absent weeks
    const activeWeeks = trend.filter((t) => t.totalMiles > 0);
    const sum = trend.reduce(
      (acc, t) => ({
        idlePct: acc.idlePct + t.idlePct,
        avgMpg: acc.avgMpg + t.avgMpg,
        hardEvents: acc.hardEvents + t.hardEvents,
        totalMiles: acc.totalMiles + t.totalMiles,
        idleFuelGal: acc.idleFuelGal + t.idleFuelGal,
        score: acc.score + t.score,
      }),
      { idlePct: 0, avgMpg: 0, hardEvents: 0, totalMiles: 0, idleFuelGal: 0, score: 0 }
    );
    const denom = Math.max(1, activeWeeks.length || trend.length);
    const trailing4WeekAvg = {
      idlePct: sum.idlePct / denom,
      avgMpg: sum.avgMpg / denom,
      hardEvents: sum.hardEvents / denom,
      totalMiles: sum.totalMiles / denom,
      idleFuelGal: sum.idleFuelGal / denom,
      score: sum.score / denom,
    };

    const noActivity = row.totalMiles === 0 && row.idleTimeMin === 0;

    const diffVsAvg = {
      idlePctPts: row.idlePct - trailing4WeekAvg.idlePct,
      avgMpg: row.avgMpg - trailing4WeekAvg.avgMpg,
      hardEvents: row.hardEvents - trailing4WeekAvg.hardEvents,
      score: row.score - trailing4WeekAvg.score,
    };

    return {
      driverContactId: contact?.id ?? '',
      motiveDriverId: row.driverId,
      displayName: row.driverName,
      firstName: firstName(row.driverName),
      phoneE164: contact?.phoneE164 ?? null,
      enrolled: contact?.enrolled ?? false,
      optedOut: contact?.optedOut ?? false,
      noActivity,
      current: row,
      rank,
      totalDrivers,
      fleetAvgMpg: current.fleetAvgMpg,
      trend,
      trailing4WeekAvg,
      diffVsAvg,
    };
  });

  // Re-rank within the reachable population — drivers with no phone or who
  // opted out are removed from the rank denominator entirely. Excluded
  // (enrolled=false) drivers KEEP their rank so admin sees where they'd
  // have placed if re-enabled. Result: every visible driver in the
  // preview gets a contiguous 1..N rank with no gaps.
  const reachable = reports.filter((r) => !r.optedOut && r.phoneE164 != null);
  reachable.sort((a, b) => b.current.score - a.current.score);
  const totalReachable = reachable.length;
  reachable.forEach((r, i) => {
    r.rank = i + 1;
    r.totalDrivers = totalReachable;
  });
  // Unreachable drivers won't be shown / sent. Sentinel rank=0 so any
  // downstream consumer can tell them apart from a real rank.
  for (const r of reports) {
    if (!reachable.includes(r)) {
      r.rank = 0;
      r.totalDrivers = totalReachable;
    }
  }

  return {
    orgId,
    weekStart: last.startDate,
    weekEnd: last.endDate,
    fleetAvgMpg: current.fleetAvgMpg,
    reports,
    unmatchedDriverNames,
  };
}
