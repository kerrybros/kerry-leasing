/**
 * Samsara telematics vehicles for service plan matching.
 * Merges vehicle map (roster) with distinct VINs from utilization so service plan
 * sync works when roster is stale or skipped but fuel-energy has populated VINs.
 */

import type { PrismaClient as AppPrismaClient } from '../generated/app-client/index.js';

export type SamsaraPlanVehicle = { vin: string; vehicleNumber: string | null };

export async function loadSamsaraTelematicsVehiclesForServicePlan(
  prisma: AppPrismaClient,
  clerkOrgId: string
): Promise<SamsaraPlanVehicle[]> {
  const [mapRows, utilRows] = await Promise.all([
    prisma.telematicsVehicleMap.findMany({
      where: { clerkOrgId, provider: 'SAMSARA' },
      select: { vin: true, providerVehicleName: true },
      distinct: ['vin'],
    }),
    prisma.samsaraVehicleUtilization.findMany({
      where: { clerkOrgId, vin: { not: null } },
      select: { vin: true, vehicleName: true },
      distinct: ['vin'],
    }),
  ]);

  const byVin = new Map<string, SamsaraPlanVehicle>();

  for (const r of mapRows) {
    const v = r.vin.trim();
    if (!v) continue;
    byVin.set(v, { vin: v, vehicleNumber: r.providerVehicleName ?? null });
  }

  for (const r of utilRows) {
    const v = r.vin!.trim();
    if (!v) continue;
    const existing = byVin.get(v);
    if (!existing) {
      byVin.set(v, { vin: v, vehicleNumber: r.vehicleName ?? null });
    } else if (!existing.vehicleNumber && r.vehicleName) {
      existing.vehicleNumber = r.vehicleName;
    }
  }

  return [...byVin.values()];
}

/** Distinct trimmed VINs for quick set operations (e.g. org bootstrap). */
export async function loadSamsaraTelematicsVinSetForServicePlan(
  prisma: AppPrismaClient,
  clerkOrgId: string
): Promise<Set<string>> {
  const vehicles = await loadSamsaraTelematicsVehiclesForServicePlan(prisma, clerkOrgId);
  return new Set(vehicles.map((x) => x.vin));
}
