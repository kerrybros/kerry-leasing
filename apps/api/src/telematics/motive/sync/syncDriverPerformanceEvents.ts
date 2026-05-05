/**
 * SYNC MOTIVE DRIVER PERFORMANCE EVENTS
 * Fetches per-event safety data from Motive API and stores in database.
 *
 * Source: GET /v2/driver_performance_events
 * Writes to: motive_driver_performance_events
 *
 * Captures all event types: hard_accel, hard_brake, hard_corner, speeding,
 * cell_phone, distraction, seat_belt_violation, tailgating, crash, etc.
 * Camera media availability is stored for downstream retrieval.
 *
 * Note: Uses company-configured rollup timezone (Eastern) via X-Time-Zone header.
 * The `date` param is a YYYY-MM-DD calendar date.
 */

import { appPrisma } from '../../../lib/prisma.js';
import { MotiveClient } from '../client.js';
import { SyncResult } from '../types.js';

interface MotivePerfEventDriver {
  id?: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  email?: string;
}

interface MotivePerfEventVehicle {
  id?: number;
  number?: string;
  vin?: string;
}

interface MotiveCameraMedia {
  id?: number;
  available?: boolean;
  cam_positions?: string[];
  cam_type?: string;
  uploaded_at?: string;
}

interface MotiveDriverPerformanceEvent {
  id: number;
  type: string;
  start_time: string;
  end_time?: string;
  duration?: number;
  acceleration?: string;
  start_speed?: string;
  end_speed?: string;
  max_speed?: string;
  lat?: string;
  lon?: string;
  location?: string;
  intensity?: string;
  severity?: string;
  coaching_status?: string;
  coached_at?: string;
  primary_behavior?: string[];
  secondary_behaviors?: string[];
  driver?: MotivePerfEventDriver;
  vehicle?: MotivePerfEventVehicle;
  camera_media?: MotiveCameraMedia;
}

export async function syncDriverPerformanceEvents(
  clerkOrgId: string,
  apiKey: string,
  date: string,
  verify: boolean = false
): Promise<SyncResult> {
  const result: SyncResult = {
    endpoint: 'driver_performance_events',
    date,
    recordCount: 0,
    newCount: 0,
    updatedCount: 0,
    unchangedCount: 0,
    errorCount: 0,
    errors: [],
  };

  try {
    const client = new MotiveClient(apiKey);
    const records = await client.get<MotiveDriverPerformanceEvent>(
      '/v2/driver_performance_events',
      { start_date: date, end_date: date }
    );

    result.recordCount = records.length;

    for (const record of records) {
      try {
        const motiveEventId = BigInt(record.id);
        const cam = record.camera_media;

        const recordData = {
          clerkOrgId,
          motiveEventId,
          driverId:          record.driver?.id != null    ? BigInt(record.driver.id)  : null,
          driverFirstName:   record.driver?.first_name   ?? null,
          driverLastName:    record.driver?.last_name    ?? null,
          driverUsername:    record.driver?.username     ?? null,
          driverEmail:       record.driver?.email        ?? null,
          vehicleId:         record.vehicle?.id != null  ? BigInt(record.vehicle.id) : null,
          vehicleNumber:     record.vehicle?.number      ?? null,
          vehicleVin:        record.vehicle?.vin         ?? null,
          eventType:         record.type,
          primaryBehaviors:  record.primary_behavior     ?? null,
          secondaryBehaviors: record.secondary_behaviors ?? null,
          severity:          record.severity             ?? null,
          intensity:         record.intensity            ?? null,
          duration:          record.duration             ?? null,
          startTime:         record.start_time,
          endTime:           record.end_time             ?? null,
          date,
          startSpeed: record.start_speed != null ? parseFloat(record.start_speed) : null,
          endSpeed:   record.end_speed   != null ? parseFloat(record.end_speed)   : null,
          maxSpeed:   record.max_speed   != null ? parseFloat(record.max_speed)   : null,
          lat: record.lat != null ? parseFloat(record.lat) : null,
          lon: record.lon != null ? parseFloat(record.lon) : null,
          location:          record.location             ?? null,
          coachingStatus:    record.coaching_status      ?? null,
          coachedAt:         record.coached_at           ?? null,
          cameraMediaAvailable: cam?.available           ?? null,
          cameraMediaId:        cam?.id != null          ? BigInt(cam.id) : null,
          cameraCamType:        cam?.cam_type            ?? null,
          cameraCamPositions:   cam?.cam_positions       ?? null,
          cameraUploadedAt:     cam?.uploaded_at         ?? null,
          rawResponse: record as any,
        };

        const existing = await appPrisma.motiveDriverPerformanceEvent.findUnique({
          where: { clerkOrgId_motiveEventId: { clerkOrgId, motiveEventId } },
        });

        if (!existing) {
          await appPrisma.motiveDriverPerformanceEvent.create({ data: recordData });
          result.newCount++;
        } else {
          // Coaching status and camera availability can update after initial sync
          const hasChanged =
            existing.coachingStatus       !== recordData.coachingStatus ||
            existing.cameraMediaAvailable !== recordData.cameraMediaAvailable ||
            existing.severity             !== recordData.severity ||
            existing.coachedAt            !== recordData.coachedAt;

          if (hasChanged || verify) {
            await appPrisma.motiveDriverPerformanceEvent.update({
              where: { clerkOrgId_motiveEventId: { clerkOrgId, motiveEventId } },
              data: {
                ...recordData,
                lastVerifiedAt: verify ? new Date() : existing.lastVerifiedAt,
                dataVersion: existing.dataVersion + 1,
              },
            });
            result.updatedCount++;
          } else {
            result.unchangedCount++;
          }
        }
      } catch (err: any) {
        result.errorCount++;
        result.errors.push({ recordId: String(record.id), error: err.message });
      }
    }

    console.log(
      `[Motive] Driver perf events sync for ${date}: ${result.newCount} new, ` +
      `${result.unchangedCount} unchanged, ${result.updatedCount} updated, ${result.errorCount} errors`
    );
    return result;
  } catch (err: any) {
    if (err?.name?.startsWith('Telematics')) throw err;
    console.error(`Failed to sync driver perf events for ${clerkOrgId} on ${date}:`, err.message);
    result.errorCount = 1;
    result.errors.push({ recordId: 'driver_performance_events', error: err.message });
    return result;
  }
}
