/**
 * SYNC SAMSARA VEHICLE STATS
 * Captures a point-in-time snapshot of OBD and GPS odometer/engine readings
 * for all Samsara vehicles.
 *
 * Source: GET /fleet/vehicles/stats
 * Types: obdOdometerMeters, obdEngineSeconds, gpsOdometerMeters
 *
 * Stored raw (source units) in samsara_vehicle_stats_snapshots.
 * Uniqueness: clerkOrgId + vehicleId + capturedAt (from Samsara stat timestamps).
 */

import { appPrisma } from '../../../lib/prisma.js';
import { SamsaraClient } from '../client.js';
import { SyncResult } from '../types.js';

const REQUESTED_TYPES = ['obdOdometerMeters', 'obdEngineSeconds', 'gpsOdometerMeters'];

interface StatEntry {
  time: string;
  value: number;
}

interface VehicleStatsRow {
  id: string;
  name: string;
  obdOdometerMeters?: StatEntry;
  obdEngineSeconds?: StatEntry;
  gpsOdometerMeters?: StatEntry;
}

function snapshotPayloadEqual(
  existing: {
    vehicleName: string;
    obdOdometerMeters: number | null;
    obdEngineSeconds: number | null;
    gpsOdometerMeters: number | null;
  },
  next: {
    vehicleName: string;
    obdOdometerMeters: number | null;
    obdEngineSeconds: number | null;
    gpsOdometerMeters: number | null;
  }
): boolean {
  return (
    existing.vehicleName === next.vehicleName &&
    existing.obdOdometerMeters === next.obdOdometerMeters &&
    existing.obdEngineSeconds === next.obdEngineSeconds &&
    existing.gpsOdometerMeters === next.gpsOdometerMeters
  );
}

export async function syncSamsaraVehicleStats(
  clerkOrgId: string,
  apiToken: string
): Promise<SyncResult> {
  const result: SyncResult = {
    endpoint: 'vehicle_stats',
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
    const vehicles = await client.get<VehicleStatsRow>('/fleet/vehicles/stats', {
      types: REQUESTED_TYPES.join(','),
      limit: 512,
    });

    result.recordCount = vehicles.length;

    for (const v of vehicles) {
      try {
        const time =
          v.obdOdometerMeters?.time ||
          v.obdEngineSeconds?.time ||
          v.gpsOdometerMeters?.time ||
          new Date().toISOString();

        const capturedAt = new Date(time);

        const payload = {
          vehicleName: v.name,
          obdOdometerMeters: v.obdOdometerMeters?.value ?? null,
          obdEngineSeconds: v.obdEngineSeconds?.value ?? null,
          gpsOdometerMeters: v.gpsOdometerMeters?.value ?? null,
        };

        const existing = await appPrisma.samsaraVehicleStatsSnapshot.findUnique({
          where: {
            clerkOrgId_vehicleId_capturedAt: {
              clerkOrgId,
              vehicleId: v.id,
              capturedAt,
            },
          },
        });

        if (!existing) {
          await appPrisma.samsaraVehicleStatsSnapshot.create({
            data: {
              clerkOrgId,
              vehicleId: v.id,
              capturedAt,
              ...payload,
            },
          });
          result.newCount++;
        } else if (snapshotPayloadEqual(existing, payload)) {
          result.unchangedCount++;
        } else {
          await appPrisma.samsaraVehicleStatsSnapshot.update({
            where: { id: existing.id },
            data: payload,
          });
          result.updatedCount++;
        }
      } catch (err: any) {
        result.errorCount++;
        result.errors.push({ recordId: v.id, error: err.message });
        console.error(`[Samsara] Error storing stats for vehicle ${v.name}:`, err.message);
      }
    }

    console.log(
      `[Samsara] Vehicle stats snapshot complete: ${result.recordCount} vehicles, ` +
        `${result.newCount} inserted, ${result.unchangedCount} unchanged, ${result.updatedCount} updated, ` +
        `${result.errorCount} errors`
    );
    return result;
  } catch (err: any) {
    if (err?.name?.startsWith('Telematics')) throw err;
    result.errorCount = 1;
    result.errors.push({ recordId: 'stats', error: err.message });
    console.error(`[Samsara] syncSamsaraVehicleStats error:`, err.message);
    return result;
  }
}
