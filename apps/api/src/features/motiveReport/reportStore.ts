/**
 * Persist a parsed Driver Fuel Performance export: one MotiveReportIngest row
 * plus one MotiveReportDriverFuelPerformance row per (driver, vehicle) line.
 *
 * Idempotent on sourceRef (email internetMessageId / "file:<name>"), and rows
 * are upserted on (org, window, driver, vehicle) so re-importing the same
 * window from a fresh export overwrites the numbers rather than duplicating.
 *
 * Driver identity: Motive's "Driver ID" column is blank for this fleet (the
 * Driver Company ID field is unset in Motive), so drivers are matched to a
 * motiveDriverId by EXACT normalized name against motive_driver_master, the
 * same rule the weekly report builder uses. Unmatched rows are stored with a
 * null motiveDriverId and reported back so someone can look.
 */

import { getAppPrisma } from '../../lib/prisma.js';
import {
  MotiveReportGranularity,
  MotiveReportIngestStatus,
  MotiveReportSource,
} from '../../generated/app-client/index.js';
import type { DriverFuelPerformanceRow } from './parseDriverFuelPerformanceCsv.js';
import { normalizeDriverName } from './parseDriverFuelPerformanceCsv.js';
import type { ReportWindow } from './reportWindow.js';

export interface StoreReportInput {
  clerkOrgId: string;
  source: MotiveReportSource;
  sourceRef: string;
  reportName?: string | null;
  subject?: string | null;
  attachmentName?: string | null;
  receivedAt?: Date | null;
  window: ReportWindow;
  rawCsv: string;
  rows: DriverFuelPerformanceRow[];
  /** Defaults to ACCEPTED. UNVERIFIED files are stored for audit but never score. */
  status?: MotiveReportIngestStatus;
  statusReason?: string | null;
  labelStart?: string | null;
  labelEnd?: string | null;
}

export interface StoreReportResult {
  ingestId: string;
  alreadyIngested: boolean;
  rowCount: number;
  matchedDrivers: number;
  unmatchedDriverNames: string[];
}

/**
 * normalized name → motiveDriverId, for one org.
 *
 * Motive keeps deactivated user records, so a driver who was re-created has two
 * records with the same name. Prefer the ACTIVE one; fall back to the single
 * record if only one exists in any state; refuse to guess (null) only when two
 * or more ACTIVE users share a name.
 */
export async function buildDriverNameIndex(clerkOrgId: string): Promise<Map<string, number | null>> {
  const prisma = getAppPrisma();
  const masters = await prisma.motiveDriverMaster.findMany({
    where: { clerkOrgId },
    select: { motiveDriverId: true, firstName: true, lastName: true, status: true },
  });
  const byName = new Map<string, { active: Set<number>; any: Set<number> }>();
  for (const m of masters) {
    const name = normalizeDriverName(`${m.firstName ?? ''} ${m.lastName ?? ''}`);
    if (!name) continue;
    const e = byName.get(name) ?? { active: new Set<number>(), any: new Set<number>() };
    e.any.add(m.motiveDriverId);
    if ((m.status ?? '').toLowerCase() === 'active') e.active.add(m.motiveDriverId);
    byName.set(name, e);
  }
  const index = new Map<string, number | null>();
  for (const [name, e] of byName) {
    if (e.active.size === 1) index.set(name, [...e.active][0]);
    else if (e.active.size === 0 && e.any.size === 1) index.set(name, [...e.any][0]);
    else index.set(name, null); // genuinely ambiguous
  }
  // Fall back to names seen on utilization rows (covers drivers not yet in master).
  const seen = await prisma.motiveDriverUtilization.findMany({
    where: { clerkOrgId },
    distinct: ['driverId'],
    select: { driverId: true, driverFirstName: true, driverLastName: true },
  });
  for (const s of seen) {
    const name = normalizeDriverName(`${s.driverFirstName ?? ''} ${s.driverLastName ?? ''}`);
    if (!name || index.has(name)) continue;
    index.set(name, s.driverId);
  }
  return index;
}

export async function storeReport(input: StoreReportInput): Promise<StoreReportResult> {
  const prisma = getAppPrisma();

  const existing = await prisma.motiveReportIngest.findUnique({
    where: { sourceRef: input.sourceRef },
    select: { id: true, rowCount: true },
  });
  if (existing) {
    return {
      ingestId: existing.id,
      alreadyIngested: true,
      rowCount: existing.rowCount,
      matchedDrivers: 0,
      unmatchedDriverNames: [],
    };
  }

  const nameIndex = await buildDriverNameIndex(input.clerkOrgId);
  const unmatched = new Set<string>();
  let matched = 0;

  const ingest = await prisma.motiveReportIngest.create({
    data: {
      clerkOrgId: input.clerkOrgId,
      source: input.source,
      sourceRef: input.sourceRef,
      reportName: input.reportName ?? null,
      subject: input.subject ?? null,
      attachmentName: input.attachmentName ?? null,
      receivedAt: input.receivedAt ?? null,
      windowStart: input.window.windowStart,
      windowEnd: input.window.windowEnd,
      granularity: input.window.granularity as MotiveReportGranularity,
      status: input.status ?? MotiveReportIngestStatus.ACCEPTED,
      statusReason: input.statusReason ?? null,
      labelStart: input.labelStart ?? null,
      labelEnd: input.labelEnd ?? null,
      rowCount: input.rows.length,
      rawCsv: input.rawCsv,
    },
    select: { id: true },
  });

  for (const r of input.rows) {
    const motiveDriverId = nameIndex.get(r.driverNormalizedName) ?? null;
    if (motiveDriverId != null) matched++;
    else unmatched.add(r.driverName);

    const metrics = {
      motiveDriverId,
      driverName: r.driverName,
      driverCompanyId: r.driverCompanyId,
      groupName: r.groupName,
      avgMpg: r.avgMpg,
      movingMpg: r.movingMpg,
      totalDistanceMi: r.totalDistanceMi,
      totalFuelGal: r.totalFuelGal,
      carbonLbs: r.carbonLbs,
      utilizationPct: r.utilizationPct,
      drivingTimeMin: r.drivingTimeMin,
      drivingFuelGal: r.drivingFuelGal,
      idlingTimeMin: r.idlingTimeMin,
      idledFuelGal: r.idledFuelGal,
      overRpmPct: r.overRpmPct,
      avgSpeedMph: r.avgSpeedMph,
      fuelCostUsd: r.fuelCostUsd,
      cruiseDistancePct: r.cruiseDistancePct,
      cruiseTimePct: r.cruiseTimePct,
      hardBrakingPer1kMi: r.hardBrakingPer1kMi,
      hardAccelPer1kMi: r.hardAccelPer1kMi,
      hardCorneringPer1kMi: r.hardCorneringPer1kMi,
      rawRow: r.raw,
    };

    await prisma.motiveReportDriverFuelPerformance.upsert({
      where: {
        reportRowKey: {
          clerkOrgId: input.clerkOrgId,
          windowStart: input.window.windowStart,
          windowEnd: input.window.windowEnd,
          driverNormalizedName: r.driverNormalizedName,
          vehicleName: r.vehicleName,
        },
      },
      create: {
        clerkOrgId: input.clerkOrgId,
        ingestId: ingest.id,
        windowStart: input.window.windowStart,
        windowEnd: input.window.windowEnd,
        driverNormalizedName: r.driverNormalizedName,
        vehicleName: r.vehicleName,
        ...metrics,
      },
      update: { ingestId: ingest.id, ...metrics },
    });
  }

  return {
    ingestId: ingest.id,
    alreadyIngested: false,
    rowCount: input.rows.length,
    matchedDrivers: matched,
    unmatchedDriverNames: [...unmatched].sort(),
  };
}
