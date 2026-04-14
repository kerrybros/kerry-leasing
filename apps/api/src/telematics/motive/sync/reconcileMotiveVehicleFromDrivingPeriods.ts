/**
 * RECONCILE MOTIVE VEHICLE UTILIZATION FROM DRIVING PERIODS
 *
 * The Motive v2/vehicle_utilization daily rollup can under-report distance and
 * driving time for some vehicles (observed for units 2241 and 2243 on multiple
 * days). The cause is a Motive-side aggregation issue — changing the UTC/EST
 * boundary does not fix it.
 *
 * The v1/driving_periods endpoint is authoritative for distance and trip-level
 * duration because it returns individual trip records keyed by Motive period ID
 * rather than relying on the rollup aggregation.
 *
 * This function runs AFTER both syncVehicleUtilization and syncDrivingPeriods
 * have written their data for the same org+date. For any vehicle where the v2
 * rollup totalDistance diverges >10% from the sum of driving_periods distances,
 * the vehicle_utilization record is patched to use the driving_periods value.
 * The same check is applied to drivingTime.
 *
 * Threshold: 10% divergence (enough to ignore normal ELD finalization noise of 1-5%,
 * while catching genuine rollup failures of 13-35%).
 */

import { appPrisma } from '../../../lib/prisma.js';

const DIVERGENCE_THRESHOLD = 0.10; // 10%

interface ReconcileResult {
  vehiclesChecked: number;
  reconciled: number;
  patches: Array<{
    vehicleId: number;
    vehicleNumber: string | null;
    field: 'totalDistance' | 'drivingTime';
    before: number;
    after: number;
    pctDiff: string;
  }>;
}

export async function reconcileMotiveVehicleFromDrivingPeriods(
  clerkOrgId: string,
  date: string
): Promise<ReconcileResult> {
  const result: ReconcileResult = {
    vehiclesChecked: 0,
    reconciled: 0,
    patches: [],
  };

  // Fetch all driving periods for this org+date, aggregated by vehicleId
  const periods = await appPrisma.motiveDrivingPeriod.findMany({
    where: { clerkOrgId, date },
    select: { vehicleId: true, vehicleNumber: true, distance: true, duration: true },
  });

  if (periods.length === 0) return result;

  // Build per-vehicle sums from driving_periods
  const byVehicle = new Map<
    number,
    { vehicleNumber: string | null; distMi: number; durationSec: number }
  >();

  for (const p of periods) {
    const prev = byVehicle.get(p.vehicleId) ?? {
      vehicleNumber: p.vehicleNumber,
      distMi: 0,
      durationSec: 0,
    };
    // distance stored as "X mi" string — parseFloat("0.1 mi") = 0.1 in JS
    const distMi = p.distance ? parseFloat(p.distance) || 0 : 0;
    const durationSec = p.duration ?? 0;
    byVehicle.set(p.vehicleId, {
      vehicleNumber: prev.vehicleNumber,
      distMi: prev.distMi + distMi,
      durationSec: prev.durationSec + durationSec,
    });
  }

  for (const [vehicleId, { vehicleNumber, distMi, durationSec }] of byVehicle) {
    result.vehiclesChecked++;

    const util = await appPrisma.motiveVehicleUtilization.findUnique({
      where: { clerkOrgId_vehicleId_date: { clerkOrgId, vehicleId, date } },
    });
    if (!util) continue;

    const updates: Record<string, number> = {};

    // --- Distance check ---
    if (util.totalDistance != null && distMi > 0) {
      const base = Math.max(util.totalDistance, 0.1);
      const diff = Math.abs(distMi - util.totalDistance) / base;
      if (diff > DIVERGENCE_THRESHOLD) {
        updates.totalDistance = distMi;
        result.patches.push({
          vehicleId,
          vehicleNumber,
          field: 'totalDistance',
          before: util.totalDistance,
          after: distMi,
          pctDiff: `${(((distMi - util.totalDistance) / base) * 100).toFixed(1)}%`,
        });
      }
    }

    // --- Driving time check (periods in seconds; util stored in minutes) ---
    const durationMin = durationSec / 60;
    if (util.drivingTime != null && durationMin > 0) {
      const base = Math.max(util.drivingTime, 0.1);
      const diff = Math.abs(durationMin - util.drivingTime) / base;
      if (diff > DIVERGENCE_THRESHOLD) {
        updates.drivingTime = Math.round(durationMin);
        result.patches.push({
          vehicleId,
          vehicleNumber,
          field: 'drivingTime',
          before: util.drivingTime,
          after: Math.round(durationMin),
          pctDiff: `${(((durationMin - util.drivingTime) / base) * 100).toFixed(1)}%`,
        });
      }
    }

    if (Object.keys(updates).length > 0) {
      await appPrisma.motiveVehicleUtilization.update({
        where: { clerkOrgId_vehicleId_date: { clerkOrgId, vehicleId, date } },
        data: updates,
      });
      result.reconciled++;
    }
  }

  return result;
}
