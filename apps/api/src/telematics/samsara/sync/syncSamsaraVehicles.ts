/**
 * SYNC SAMSARA VEHICLES
 * Upserts the full Samsara vehicle roster into telematics_vehicle_maps.
 * Includes inactive vehicles (status "deactivated") — let the data speak for itself.
 *
 * Called from syncSamsaraOrgForDate with a 7-day gate so it only runs
 * once per week per org, not on every daily sync.
 */

import { appPrisma } from '../../../lib/prisma.js';
import { SamsaraClient } from '../client.js';
import { SyncResult } from '../types.js';

interface SamsaraVehicle {
  id: string;
  name: string;
  vin?: string;
  externalIds?: Record<string, string>;
  staticAssignedDriver?: { id: string; name: string };
  licensePlate?: string;
  make?: string;
  model?: string;
  year?: number;
}

export async function syncSamsaraVehicles(
  clerkOrgId: string,
  apiToken: string
): Promise<SyncResult> {
  const result: SyncResult = {
    endpoint: 'vehicles_roster',
    date: new Date().toISOString().split('T')[0],
    recordCount: 0,
    newCount: 0,
    updatedCount: 0,
    unchangedCount: 0,
    errorCount: 0,
    errors: [],
  };

  const client = new SamsaraClient(apiToken);

  try {
    const vehicles = await client.get<SamsaraVehicle>('/fleet/vehicles', { limit: 512 });
    result.recordCount = vehicles.length;

    for (const v of vehicles) {
      try {
        const vin = v.externalIds?.['samsara.vin'] || v.vin || null;

        if (!vin) {
          // Can't map without VIN — log but don't fail the whole sync
          console.warn(`[Samsara] Vehicle ${v.name} (${v.id}) has no VIN — skipped from vehicle map`);
          result.unchangedCount++;
          continue;
        }

        try {
          await appPrisma.telematicsVehicleMap.upsert({
            where: {
              clerkOrgId_provider_providerVehicleId: {
                clerkOrgId,
                provider: 'SAMSARA',
                providerVehicleId: v.id,
              },
            },
            create: {
              clerkOrgId,
              vin,
              provider: 'SAMSARA',
              providerVehicleId: v.id,
              providerVehicleName: v.name,
            },
            update: {
              vin,
              providerVehicleName: v.name,
            },
          });
          result.newCount++;
        } catch (vinErr: any) {
          if (vinErr.code === 'P2002') {
            // VIN already mapped to a different provider vehicle ID (duplicate VIN in API data).
            // Update name only — do not overwrite the VIN mapping.
            console.warn(`[Samsara] VIN conflict for vehicle ${v.name} (${v.id}) — VIN ${vin} already mapped. Updating name only.`);
            await appPrisma.telematicsVehicleMap.updateMany({
              where: { clerkOrgId, provider: 'SAMSARA', providerVehicleId: v.id },
              data: { providerVehicleName: v.name },
            });
            result.unchangedCount++;
          } else {
            throw vinErr;
          }
        }
      } catch (err: any) {
        result.errorCount++;
        result.errors.push({ recordId: v.id, error: err.message });
        console.error(`[Samsara] Error upserting vehicle ${v.name}:`, err.message);
      }
    }

    // Re-tally: upsert always triggers create or update path
    console.log(
      `[Samsara] Vehicle roster sync complete: ${result.recordCount} vehicles processed, ` +
      `${result.errorCount} errors`
    );
    return result;
  } catch (err: any) {
    result.errorCount = 1;
    result.errors.push({ recordId: 'roster', error: err.message });
    console.error(`[Samsara] syncSamsaraVehicles error:`, err.message);
    return result;
  }
}
