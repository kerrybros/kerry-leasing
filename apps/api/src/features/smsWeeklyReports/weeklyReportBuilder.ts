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
import { DriverContactSource, DriverSmsConsentStatus } from '../../generated/app-client/index.js';
import { getLastWeekRange, getTrailing4WeekRanges, type WeekRange } from './dateWindow.js';
import { loadExcludedMotiveDriverIds } from '../drivers/excludedDrivers.js';
import { readCredentials } from '../../lib/credentials.js';
import { MotiveClient } from '../../telematics/motive/client.js';

/** Add one calendar day to a YYYY-MM-DD string (UTC-safe). */
function nextYmd(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

export interface WeeklyKpiTrendPoint {
  weekStart: string;
  score: number;
  /** Motive's OWN rolling-4-week safety score as-of this week's end (null if none stored). */
  motiveScore: number | null;
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
  email: string | null;
  enrolled: boolean;
  optedOut: boolean;
  emailOptedOut: boolean;
  smsConsentStatus: DriverSmsConsentStatus;  // only CONFIRMED contacts get a weekly SMS (A2P 10DLC)
  noActivity: boolean;

  // Current week
  current: ScorecardDriver;
  /** Motive's OWN rolling-4-week safety score as-of the report week end (null if none). */
  motiveScore: number | null;
  rank: number;            // overall composite-score rank (within reachable pop.)
  idleRank: number;        // rank by idle % (lower is better), within reachable pop.
  safetyRank: number;      // rank by Motive's safety score (higher is better), reachable w/ score
  safetyTotal: number;     // denominator for safetyRank (reachable drivers that have a Motive score)
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

  // Motive's OWN safety score is a rolling 4-week number, anchored to a date and
  // REFRESHED every Monday (Motive docs: "Safety Score"). The refresh that runs
  // the Monday AFTER a week closes is the one that reflects that week's driving,
  // and it's what a fleet manager sees if they pull the driver up — so we anchor
  // each week's score to its Monday-after (weekEnd + 1), not the week end itself.
  // Surfaced verbatim (no recompute) so the number is reproducible in Motive.
  const currentAnchor = nextYmd(last.endDate); // Monday after the report week
  const scoreRows = await prisma.motiveScorecardSummary.findMany({
    where: {
      clerkOrgId: orgId,
      date: { gte: trailing[0].startDate, lte: currentAnchor },
      score: { not: null },
    },
    select: { driverId: true, date: true, score: true },
    orderBy: { date: 'desc' },
  });
  const motiveScoresByDriver = new Map<number, { date: string; score: number }[]>();
  for (const r of scoreRows) {
    if (r.score == null) continue;
    const arr = motiveScoresByDriver.get(r.driverId) ?? [];
    arr.push({ date: r.date, score: r.score }); // pushed in date-desc order
    motiveScoresByDriver.set(r.driverId, arr);
  }
  /** Latest stored Motive score with date <= asOf (the rolling score as of that day). */
  const motiveScoreAsOf = (driverId: number, asOf: string): number | null => {
    const arr = motiveScoresByDriver.get(driverId);
    const hit = arr?.find((x) => x.date <= asOf);
    return hit ? hit.score : null;
  };

  // The current-week anchor (this Monday) usually ISN'T in our daily snapshots
  // yet — the daily sync pulls "yesterday", so a Monday-morning send predates
  // it. Pull that one refresh live (one call, all drivers) so the report matches
  // what Motive shows right now. Stored value is the fallback if the call fails.
  let liveCurrent: Map<number, number> | null = null;
  try {
    const acct = await prisma.telematicsProviderAccount.findUnique({
      where: { clerkOrgId: orgId, provider: 'MOTIVE' },
    });
    if (acct?.status === 'ACTIVE') {
      const apiKey = readCredentials(acct.credentialsJson).apiKey as string | undefined;
      if (apiKey) {
        const rows = await new MotiveClient(apiKey).get<{ driver?: { id?: number }; score?: number }>(
          '/v1/scorecard_summary',
          { start_date: currentAnchor, end_date: currentAnchor },
        );
        liveCurrent = new Map();
        for (const r of rows) {
          if (r.driver?.id != null && r.score != null) liveCurrent.set(r.driver.id, r.score);
        }
      }
    }
  } catch (err: any) {
    console.warn(`[smsWeeklyReports] live Motive score pull failed for ${orgId}, using stored: ${err.message}`);
  }
  /** Motive's score reflecting the just-closed report week (live Monday refresh, else stored). */
  const currentMotiveScore = (driverId: number): number | null =>
    liveCurrent?.get(driverId) ?? motiveScoreAsOf(driverId, currentAnchor);

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
      emailOptedOut: true,
      smsConsentStatus: true,
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
          emailOptedOut: true,
          smsConsentStatus: true,
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
      const isCurrentWeek = week.startDate === last.startDate;
      return {
        weekStart: week.startDate,
        score: r?.score ?? 0,
        // Each week's score = Motive's refresh the Monday after it closed.
        motiveScore: isCurrentWeek
          ? currentMotiveScore(row.driverId)
          : motiveScoreAsOf(row.driverId, nextYmd(week.endDate)),
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
      email: contact?.email ?? null,
      enrolled: contact?.enrolled ?? false,
      optedOut: contact?.optedOut ?? false,
      emailOptedOut: contact?.emailOptedOut ?? false,
      smsConsentStatus: contact?.smsConsentStatus ?? DriverSmsConsentStatus.PENDING,
      noActivity,
      current: row,
      motiveScore: currentMotiveScore(row.driverId),
      rank,
      idleRank: 0,    // assigned below, within the reachable population
      safetyRank: 0,  // assigned below, within the reachable population
      safetyTotal: 0, // assigned below (reachable drivers that have a Motive score)
      totalDrivers,
      fleetAvgMpg: current.fleetAvgMpg,
      trend,
      trailing4WeekAvg,
      diffVsAvg,
    };
  });

  // Re-rank within the reachable population — a driver is "reachable" if they can
  // receive the report on ANY channel: an SMS-reachable phone (has number, not
  // opted out) OR an email-reachable address (has email, not email-opted-out).
  // This originally checked phone only, which left email-only drivers unranked
  // (rank 0 → "0 of N" in their weekly email). Excluded (enrolled=false) drivers
  // KEEP their rank so admin sees where they'd have placed if re-enabled. Result:
  // every driver who receives a report gets a contiguous 1..N rank with no gaps.
  const reachable = reports.filter(
    (r) => (!r.optedOut && r.phoneE164 != null) || (!r.emailOptedOut && r.email != null),
  );
  reachable.sort((a, b) => b.current.score - a.current.score);
  const totalReachable = reachable.length;
  reachable.forEach((r, i) => {
    r.rank = i + 1;
    r.totalDrivers = totalReachable;
  });

  // Idle rank — lower % is better, across the full reachable population.
  [...reachable]
    .sort((a, b) => a.current.idlePct - b.current.idlePct)
    .forEach((r, i) => { r.idleRank = i + 1; });

  // Safety rank — by Motive's OWN rolling score (higher is better), among
  // reachable drivers that actually have a score. Drivers without one are left
  // unranked (safetyRank 0) rather than dumped at the bottom, and the safety
  // denominator (safetyTotal) reflects only the scored population.
  const reachableWithScore = reachable.filter((r) => r.motiveScore != null);
  reachableWithScore.sort((a, b) => (b.motiveScore ?? 0) - (a.motiveScore ?? 0));
  const safetyTotal = reachableWithScore.length;
  reachableWithScore.forEach((r, i) => { r.safetyRank = i + 1; });
  for (const r of reachable) {
    r.safetyTotal = safetyTotal;
    if (r.motiveScore == null) r.safetyRank = 0;
  }

  // Unreachable drivers won't be shown / sent. Sentinel rank=0 so any
  // downstream consumer can tell them apart from a real rank.
  for (const r of reports) {
    if (!reachable.includes(r)) {
      r.rank = 0;
      r.idleRank = 0;
      r.safetyRank = 0;
      r.safetyTotal = safetyTotal;
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
