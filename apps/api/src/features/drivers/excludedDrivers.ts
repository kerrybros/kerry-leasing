/**
 * Driver-exclusion helper.
 *
 * Admins toggle MotiveDriverMaster.isIncluded via /admin/drivers-setup to hide
 * specific Motive drivers from the portal. Every consumer that surfaces a
 * driver to the user — scoreboard, SMS reports, KPIs — should call
 * loadExcludedMotiveDriverIds and drop matching driverIds from its results.
 *
 * Drivers not present in MotiveDriverMaster are treated as included by default
 * (the master sync is recent; a driver who hasn't been picked up yet shouldn't
 * silently disappear).
 */

import type { PrismaClient } from '../../generated/app-client/index.js';

export async function loadExcludedMotiveDriverIds(
  prisma: PrismaClient,
  clerkOrgId: string
): Promise<Set<number>> {
  const rows = await prisma.motiveDriverMaster.findMany({
    where: { clerkOrgId, isIncluded: false },
    select: { motiveDriverId: true },
  });
  return new Set(rows.map(r => r.motiveDriverId));
}
