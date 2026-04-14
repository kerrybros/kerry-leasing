/**
 * SYNC SAMSARA SAFETY EVENTS
 * Fetches harsh driving events (harshAccel, harshBrake, etc.) from Samsara
 * and stores them in samsara_safety_events.
 *
 * Source: GET /fleet/safety-events
 * Paginated. Re-syncs last 3 days on each run (72h data lag).
 */

import { appPrisma } from '../../../lib/prisma.js';
import { SamsaraClient } from '../client.js';
import { getESTDayBounds } from '../../dates.js';
import { SyncResult } from '../types.js';

interface SafetyEventBehavior {
  behaviorLabel: string;
  maxValue?: number;
  maxValueUnit?: string;
  severity?: string;
}

interface SafetyEvent {
  id: string;
  time: string;
  vehicle: { id: string; name: string };
  driver?: { id: string; name: string };
  behaviors: SafetyEventBehavior[] | null;
  location?: { latitude: number; longitude: number; formattedAddress?: string };
}

export async function syncSamsaraSafetyEvents(
  clerkOrgId: string,
  apiToken: string,
  date: string
): Promise<SyncResult> {
  const result: SyncResult = {
    endpoint: 'safety_events',
    date,
    recordCount: 0,
    newCount: 0,
    updatedCount: 0,
    unchangedCount: 0,
    errorCount: 0,
    errors: [],
  };

  const client = new SamsaraClient(apiToken);

  try {
    const { startTime, endTime } = getESTDayBounds(date);

    const events = await client.get<SafetyEvent>('/fleet/safety-events', {
      startTime,
      endTime,
      limit: 200,
    });

    result.recordCount = events.length;

    for (const event of events) {
      try {
        // behaviors may be null/undefined for certain event types (e.g. dashcam-only events)
        const behaviors = Array.isArray(event.behaviors) ? event.behaviors : [];
        for (const behavior of behaviors) {
          // Each behavior on an event gets its own row
          const samsaraId = `${event.id}_${behavior.behaviorLabel}`;

          const existing = await appPrisma.samsaraSafetyEvent.findUnique({
            where: { clerkOrgId_samsaraId: { clerkOrgId, samsaraId } },
          });

          const row = {
            vehicleId: event.vehicle.id,
            vehicleName: event.vehicle.name,
            driverId: event.driver?.id ?? null,
            driverName: event.driver?.name ?? null,
            behaviorLabel: behavior.behaviorLabel,
            severity: behavior.severity ?? null,
            maxValue: behavior.maxValue ?? null,
            time: event.time,
            eventDate: date,
            lat: event.location?.latitude ?? null,
            lon: event.location?.longitude ?? null,
            rawResponse: event as any,
          };

          if (!existing) {
            await appPrisma.samsaraSafetyEvent.create({
              data: { clerkOrgId, samsaraId, ...row },
            });
            result.newCount++;
          } else {
            result.unchangedCount++;
          }
        }
      } catch (err: any) {
        result.errorCount++;
        result.errors.push({ recordId: event.id, error: err.message });
        console.error(`[Samsara] Error storing safety event ${event.id}:`, err.message);
      }
    }

    console.log(
      `[Samsara] Safety events sync for ${date}: ${result.newCount} new, ` +
      `${result.unchangedCount} existing, ${result.errorCount} errors`
    );
    return result;
  } catch (err: any) {
    result.errorCount = 1;
    result.errors.push({ recordId: 'safety_events', error: err.message });
    console.error(`[Samsara] syncSamsaraSafetyEvents error:`, err.message);
    return result;
  }
}
