/**
 * Build the weekly report from what was ACTUALLY SENT, not from a fresh build.
 *
 * Every card is persisted with a frozen kpiSnapshot before the send is
 * attempted, so those rows are the record of what each driver received. The
 * report is a statement about that send, so it has to read them.
 *
 * It used to rebuild from live data instead. Today that happened to agree on
 * all 35 drivers and every field, but agreement was luck rather than design: a
 * later portal pull picking up a late-arriving driver, or Motive's weekly
 * safety refresh landing between the send and the report, would have produced a
 * document that disagreed with the cards it claimed to describe. A fleet admin
 * checking it against Motive would be right and the report would be wrong.
 *
 * Reading the snapshots makes fidelity structural: the report cannot drift from
 * the send, because it is the send.
 */

import { getAppPrisma } from '../../lib/prisma.js';
import type { WeeklyDigestDriver, ReportChannel } from './sendOrgWeeklyReports.js';
import { gatherDriverVehicles } from './weeklyDigestData.js';

/** The shape frozen into kpiSnapshot at send time. */
interface Snapshot {
  motiveDriverId?: number;
  displayName?: string;
  motiveScore?: number | null;
  noActivity?: boolean;
  current?: {
    score?: number;
    idlePct?: number;
    idleFuelGal?: number;
    avgMpg?: number;
    totalMiles?: number;
  };
  trend?: Array<{ motiveScore?: number | null; idlePct?: number; idleFuelGal?: number }>;
  diffVsAvg?: { score?: number; idlePctPts?: number };
}

export async function buildDigestFromSends(
  clerkOrgId: string,
  weekStart: string,
  weekEnd: string,
): Promise<WeeklyDigestDriver[]> {
  const prisma = getAppPrisma();
  const rows = await prisma.driverWeeklyReportSent.findMany({
    where: { clerkOrgId, weekStartDate: weekStart, isTest: false },
    select: { driverContactId: true, channel: true, status: true, twilioErrorCode: true, kpiSnapshot: true },
  });
  if (rows.length === 0) return [];

  const contacts = await prisma.driverContact.findMany({
    where: { clerkOrgId, id: { in: [...new Set(rows.map((r) => r.driverContactId))] } },
    select: { id: true, phoneE164: true, email: true },
  });
  const contactById = new Map(contacts.map((c) => [c.id, c]));
  const vehicles = await gatherDriverVehicles(clerkOrgId, weekStart, weekEnd).catch(() => new Map<number, string[]>());

  // One row per (driver, channel); the report wants one per driver.
  const byDriver = new Map<string, { snap: Snapshot; channels: WeeklyDigestDriver['channels'] }>();
  for (const r of rows) {
    const snap = (r.kpiSnapshot ?? {}) as Snapshot;
    const entry = byDriver.get(r.driverContactId) ?? { snap, channels: [] };
    entry.snap = entry.snap?.displayName ? entry.snap : snap;
    entry.channels.push({ channel: r.channel as ReportChannel, status: r.status, error: r.twilioErrorCode });
    byDriver.set(r.driverContactId, entry);
  }

  const out: WeeklyDigestDriver[] = [];
  for (const [contactId, { snap, channels }] of byDriver) {
    const c = contactById.get(contactId);
    const trend = snap.trend ?? [];
    const priorSafety = trend
      .slice(0, -1)
      .map((t) => t.motiveScore)
      .filter((x): x is number => x != null);
    const motiveSafetyScore = snap.motiveScore ?? null;
    out.push({
      displayName: snap.displayName ?? 'Unknown driver',
      channels,
      motiveSafetyScore,
      motiveSafetyVsAvg:
        motiveSafetyScore == null || priorSafety.length === 0
          ? null
          : motiveSafetyScore - priorSafety.reduce((a, b) => a + b, 0) / priorSafety.length,
      score: snap.current?.score ?? 0,
      idlePct: snap.current?.idlePct ?? 0,
      idleFuelGal: snap.current?.idleFuelGal ?? 0,
      idleFuelGalLastWeek: trend.length >= 2 ? (trend[trend.length - 2].idleFuelGal ?? null) : null,
      idlePctLastWeek: trend.length >= 2 ? (trend[trend.length - 2].idlePct ?? null) : null,
      avgMpg: snap.current?.avgMpg ?? 0,
      totalMiles: snap.current?.totalMiles ?? 0,
      scoreVsAvg: snap.diffVsAvg?.score ?? 0,
      idlePctPtsVsAvg: snap.diffVsAvg?.idlePctPts ?? 0,
      weeksOfData: trend.length,
      noActivity: snap.noActivity === true,
      vehicles: snap.motiveDriverId != null ? (vehicles.get(snap.motiveDriverId) ?? []) : [],
      phoneE164: c?.phoneE164 ?? null,
      email: c?.email ?? null,
    });
  }
  return out;
}
