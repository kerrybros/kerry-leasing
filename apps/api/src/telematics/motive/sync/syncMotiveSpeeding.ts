/**
 * SYNC MOTIVE SPEEDING EVENTS
 * Fetches per-event speeding incidents from Motive and stores one row per event.
 *
 * Source: GET /v1/speeding_events   (speeding is NOT returned by
 *         /v2/driver_performance_events, so this is the only source)
 * Writes to: motive_speeding_events
 *
 * Pagination: this endpoint returns { speeding_events, per_page, page_no, total }
 * with NO `pagination` object, so the shared MotiveClient.get() would stop after
 * page 1. We paginate manually via getSinglePage() using the top-level counters.
 *
 * Note: company-configured rollup timezone (Eastern) via X-Time-Zone header;
 * the `date` param is a YYYY-MM-DD calendar date.
 */

import { appPrisma } from '../../../lib/prisma.js';
import { MotiveClient } from '../client.js';
import { SyncResult } from '../types.js';

interface MotiveSpeedingDriver {
  id?: number;
  first_name?: string;
  last_name?: string;
  email?: string;
}

interface MotiveSpeedingVehicle {
  id?: number;
  number?: string;
}

interface MotiveSpeedingMetadata {
  severity?: string;          // low | medium | high
  trigger?: string;           // "speeding"
  is_manually_changed?: boolean;
}

interface MotiveSpeedingEvent {
  id: number;
  type?: string;              // "posted", etc.
  status?: string;            // "valid" | "invalid"
  coaching_status?: string;   // coachable | pending_review | reviewed | dismissed
  start_time: string;
  end_time?: string;
  duration?: number;          // seconds
  speeding_distance_in_km?: number;
  max_over_speed_in_kph?: number;
  avg_over_speed_in_kph?: number;
  min_posted_speed_limit_in_kph?: number;
  max_posted_speed_limit_in_kph?: number;
  avg_vehicle_speed?: number; // kph (despite no _in_kph suffix on this endpoint)
  min_vehicle_speed?: number;
  max_vehicle_speed?: number;
  start_lat?: number;
  start_lon?: number;
  end_lat?: number;
  end_lon?: number;
  driver?: MotiveSpeedingDriver;
  vehicle?: MotiveSpeedingVehicle;
  metadata?: MotiveSpeedingMetadata;
}

interface SpeedingPage {
  speeding_events?: Array<{ speeding_event: MotiveSpeedingEvent }>;
  per_page?: number;
  page_no?: number;
  total?: number;
}

export async function syncMotiveSpeeding(
  clerkOrgId: string,
  apiKey: string,
  date: string,
  verify: boolean = false
): Promise<SyncResult> {
  const result: SyncResult = {
    endpoint: 'speeding_events',
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

    // Manual pagination (top-level total/per_page/page_no, no `pagination` object).
    const events: MotiveSpeedingEvent[] = [];
    let page = 1;
    while (true) {
      const data = await client.getSinglePage<never>(
        '/v1/speeding_events',
        { start_date: date, end_date: date },
        page
      ) as unknown as SpeedingPage;

      const rows = data.speeding_events ?? [];
      for (const r of rows) if (r?.speeding_event) events.push(r.speeding_event);

      const perPage = data.per_page ?? 100;
      const total = data.total ?? rows.length;
      if (page * perPage >= total || rows.length === 0) break;
      page++;
    }

    result.recordCount = events.length;

    for (const ev of events) {
      try {
        const motiveEventId = BigInt(ev.id);

        const recordData = {
          clerkOrgId,
          motiveEventId,
          driverId:        ev.driver?.id != null  ? BigInt(ev.driver.id)  : null,
          driverFirstName: ev.driver?.first_name  ?? null,
          driverLastName:  ev.driver?.last_name   ?? null,
          driverEmail:     ev.driver?.email       ?? null,
          vehicleId:       ev.vehicle?.id != null ? BigInt(ev.vehicle.id) : null,
          vehicleNumber:   ev.vehicle?.number     ?? null,
          speedingType:      ev.type              ?? null,
          severity:          ev.metadata?.severity ?? null,
          status:            ev.status            ?? null,
          coachingStatus:    ev.coaching_status   ?? null,
          isManuallyChanged: ev.metadata?.is_manually_changed ?? null,
          durationSec:        ev.duration ?? null,
          speedingDistanceKm: ev.speeding_distance_in_km ?? null,
          maxOverSpeedKph:    ev.max_over_speed_in_kph ?? null,
          avgOverSpeedKph:    ev.avg_over_speed_in_kph ?? null,
          minPostedLimitKph:  ev.min_posted_speed_limit_in_kph ?? null,
          maxPostedLimitKph:  ev.max_posted_speed_limit_in_kph ?? null,
          avgVehicleSpeedKph: ev.avg_vehicle_speed ?? null,
          maxVehicleSpeedKph: ev.max_vehicle_speed ?? null,
          startTime: ev.start_time,
          endTime:   ev.end_time ?? null,
          date,
          startLat: ev.start_lat ?? null,
          startLon: ev.start_lon ?? null,
          endLat:   ev.end_lat ?? null,
          endLon:   ev.end_lon ?? null,
          rawResponse: ev as any,
        };

        const existing = await appPrisma.motiveSpeedingEvent.findUnique({
          where: { clerkOrgId_motiveEventId: { clerkOrgId, motiveEventId } },
        });

        if (!existing) {
          await appPrisma.motiveSpeedingEvent.create({ data: recordData });
          result.newCount++;
        } else {
          // status / coaching / severity can change after initial sync
          const hasChanged =
            existing.status            !== recordData.status ||
            existing.coachingStatus    !== recordData.coachingStatus ||
            existing.severity          !== recordData.severity ||
            existing.isManuallyChanged !== recordData.isManuallyChanged;

          if (hasChanged || verify) {
            await appPrisma.motiveSpeedingEvent.update({
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
        result.errors.push({ recordId: String(ev.id), error: err.message });
      }
    }

    console.log(
      `[Motive] Speeding events sync for ${date}: ${result.newCount} new, ` +
      `${result.unchangedCount} unchanged, ${result.updatedCount} updated, ${result.errorCount} errors`
    );
    return result;
  } catch (err: any) {
    if (err?.name?.startsWith('Telematics')) throw err;
    console.error(`Failed to sync speeding events for ${clerkOrgId} on ${date}:`, err.message);
    result.errorCount = 1;
    result.errors.push({ recordId: 'speeding_events', error: err.message });
    return result;
  }
}
