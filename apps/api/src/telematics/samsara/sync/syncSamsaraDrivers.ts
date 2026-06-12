/**
 * SYNC SAMSARA DRIVERS
 *
 * Writes to samsara_drivers. The `id` on /fleet/drivers matches the
 * `operator.id` we capture on idle events, so this table is what powers
 * the operator → driver-name resolution on the IDLE map.
 *
 * No date params — driver roster is configuration data; sync less often than daily.
 */

import { appPrisma } from '../../../lib/prisma.js';
import { SamsaraClient } from '../client.js';
import { fetchDrivers, SamsaraDriverApi } from '../endpoints/drivers.js';
import { SyncResult } from '../types.js';

export async function syncSamsaraDrivers(
  clerkOrgId: string,
  apiToken: string
): Promise<SyncResult> {
  const result: SyncResult = {
    endpoint: 'drivers',
    date: 'N/A',
    recordCount: 0,
    newCount: 0,
    updatedCount: 0,
    unchangedCount: 0,
    errorCount: 0,
    errors: [],
  };

  const client = new SamsaraClient(apiToken);
  console.log(`[Samsara] Starting drivers sync for org ${clerkOrgId}`);

  try {
    const drivers = await fetchDrivers(client);
    result.recordCount = drivers.length;

    for (const drv of drivers) {
      try {
        const samsaraDriverId = String(drv.id);

        // Derive first/last from `name` if Samsara didn't provide them split.
        let firstName = drv.firstName ?? null;
        let lastName = drv.lastName ?? null;
        if ((!firstName || !lastName) && drv.name) {
          const parts = drv.name.trim().split(/\s+/);
          if (parts.length > 0) {
            firstName = firstName ?? parts[0] ?? null;
            lastName = lastName ?? (parts.length > 1 ? parts.slice(1).join(' ') : null);
          }
        }

        const data = {
          name: drv.name ?? null,
          firstName,
          lastName,
          username: drv.username ?? null,
          email: drv.email ?? null,
          phone: drv.phone ?? null,
          licenseNumber: drv.licenseNumber ?? null,
          externalIds: (drv.externalIds as any) ?? null,
          driverActivationStatus: drv.driverActivationStatus ?? null,
          rawResponse: drv as any,
        };

        const existing = await appPrisma.samsaraDriver.findUnique({
          where: { clerkOrgId_samsaraDriverId: { clerkOrgId, samsaraDriverId } },
        });

        if (!existing) {
          await appPrisma.samsaraDriver.create({
            data: { clerkOrgId, samsaraDriverId, ...data },
          });
          result.newCount++;
        } else {
          await appPrisma.samsaraDriver.update({
            where: { clerkOrgId_samsaraDriverId: { clerkOrgId, samsaraDriverId } },
            data,
          });
          result.updatedCount++;
        }
      } catch (error: any) {
        result.errorCount++;
        result.errors.push({ recordId: String(drv.id ?? 'unknown'), error: error.message });
      }
    }

    console.log(
      `[Samsara] Drivers sync complete: ${result.newCount} new, ${result.updatedCount} updated, ${result.errorCount} errors`
    );
    return result;
  } catch (error: any) {
    if (error?.name?.startsWith('Telematics')) throw error;
    console.error(`[Samsara] syncSamsaraDrivers error:`, error);
    result.errorCount = 1;
    result.errors.push({ recordId: 'sync', error: error.message });
    return result;
  }
}
