/**
 * Extra facts the operator digest needs that the driver cards do not:
 * which trucks each driver was in, and the fleet's own week over week totals.
 *
 * Both read the Motive report rows the cards were built from, through the same
 * coverage tiling, so the digest cannot quietly disagree with what the drivers
 * were told. If a week is not report-backed there is nothing to report and both
 * return empty rather than falling back to a different source, because mixing
 * sources across two weeks is exactly what makes a comparison lie.
 */

import { getAppPrisma } from '../../lib/prisma.js';
import { resolveReportCoverage } from '../motiveReport/reportCoverage.js';
import { addDays } from '../motiveReport/reportWindow.js';

export interface FleetTotals {
  weekStart: string;
  weekEnd: string;
  drivers: number;
  totalMiles: number;
  totalFuelGal: number;
  idleFuelGal: number;
  avgMpg: number;
  idlePct: number;
}

async function rowsForWeek(clerkOrgId: string, weekStart: string, weekEnd: string) {
  const coverage = await resolveReportCoverage(clerkOrgId, weekStart, weekEnd);
  if (!coverage) return null;
  const prisma = getAppPrisma();
  return prisma.motiveReportDriverFuelPerformance.findMany({
    where: {
      clerkOrgId,
      OR: coverage.windows.map((w) => ({ windowStart: w.windowStart, windowEnd: w.windowEnd })),
    },
    select: {
      motiveDriverId: true,
      driverNormalizedName: true,
      vehicleName: true,
      totalDistanceMi: true,
      totalFuelGal: true,
      idledFuelGal: true,
      idlingTimeMin: true,
      drivingTimeMin: true,
    },
  });
}

/**
 * Trucks each driver was in over the week, busiest first.
 *
 * The report carries one row per driver per vehicle, so this is a grouping
 * rather than a guess. Ordering by miles means the truck someone actually
 * worked in leads, and a few minutes in a yard truck does not.
 */
export async function gatherDriverVehicles(
  clerkOrgId: string,
  weekStart: string,
  weekEnd: string,
): Promise<Map<number, string[]>> {
  const rows = await rowsForWeek(clerkOrgId, weekStart, weekEnd);
  const out = new Map<number, string[]>();
  if (!rows) return out;
  const byDriver = new Map<number, Map<string, number>>();
  for (const r of rows) {
    if (r.motiveDriverId == null) continue;
    const name = (r.vehicleName ?? '').trim();
    if (!name) continue;
    const m = byDriver.get(r.motiveDriverId) ?? new Map<string, number>();
    m.set(name, (m.get(name) ?? 0) + (r.totalDistanceMi ?? 0));
    byDriver.set(r.motiveDriverId, m);
  }
  for (const [driverId, vehicles] of byDriver) {
    out.set(
      driverId,
      [...vehicles.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name),
    );
  }
  return out;
}

/** Fleet totals for one week, summed from the report rows that back the cards. */
export async function gatherFleetTotals(
  clerkOrgId: string,
  weekStart: string,
  weekEnd: string,
): Promise<FleetTotals | null> {
  const rows = await rowsForWeek(clerkOrgId, weekStart, weekEnd);
  if (!rows || rows.length === 0) return null;
  let miles = 0;
  let fuel = 0;
  let idleFuel = 0;
  let idleMin = 0;
  let driveMin = 0;
  const drivers = new Set<string>();
  for (const r of rows) {
    miles += r.totalDistanceMi ?? 0;
    fuel += r.totalFuelGal ?? 0;
    idleFuel += r.idledFuelGal ?? 0;
    idleMin += r.idlingTimeMin ?? 0;
    driveMin += r.drivingTimeMin ?? 0;
    drivers.add(r.driverNormalizedName);
  }
  return {
    weekStart,
    weekEnd,
    drivers: drivers.size,
    totalMiles: miles,
    totalFuelGal: fuel,
    idleFuelGal: idleFuel,
    // Ratios are derived from the sums, never averaged across drivers: a
    // driver with 20 miles would otherwise weigh the same as one with 2,000.
    avgMpg: fuel > 0 ? miles / fuel : 0,
    idlePct: idleMin + driveMin > 0 ? (idleMin / (idleMin + driveMin)) * 100 : 0,
  };
}

/** This week and the week before it, for the digest's fleet comparison. */
export async function gatherFleetComparison(
  clerkOrgId: string,
  weekStart: string,
  weekEnd: string,
): Promise<{ current: FleetTotals | null; previous: FleetTotals | null }> {
  const [current, previous] = await Promise.all([
    gatherFleetTotals(clerkOrgId, weekStart, weekEnd),
    gatherFleetTotals(clerkOrgId, addDays(weekStart, -7), addDays(weekEnd, -7)),
  ]);
  return { current, previous };
}
