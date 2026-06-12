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

interface SafetyEventBehaviorLabel {
  label: string;          // e.g. "harshTurn", "lightSpeeding", "crash" — camelCase
  source?: string;        // "automated" | "userGenerated"
  name?: string;          // Human-readable, e.g. "Harsh Turn"
}

interface SafetyEvent {
  id: string;
  time: string;
  vehicle: { id: string; name: string; externalIds?: Record<string, string> };
  driver?: { id: string; name: string };
  behaviorLabels?: SafetyEventBehaviorLabel[] | null;
  location?: { latitude: number; longitude: number };
  coachingState?: string;
  maxAccelerationGForce?: number;
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
        // The modern /fleet/safety-events response uses `behaviorLabels[]` with
        // `{ label, source, name }` per entry. The legacy interface assumed
        // `behaviors[].behaviorLabel` — wrong, so the loop silently no-op'd and
        // 0 rows were ever written. Severity is no longer a top-level API field;
        // it's encoded in the label tier (lightSpeeding/heavy/severe…) and the
        // behaviorLabelMap derives it at scorecard-read time.
        const behaviorLabels = Array.isArray(event.behaviorLabels) ? event.behaviorLabels : [];
        for (const behavior of behaviorLabels) {
          const label = behavior.label;
          if (!label) continue;
          const samsaraId = `${event.id}_${label}`;

          await appPrisma.samsaraSafetyEvent.upsert({
            where: { clerkOrgId_samsaraId: { clerkOrgId, samsaraId } },
            create: {
              clerkOrgId,
              samsaraId,
              vehicleId: event.vehicle.id,
              vehicleName: event.vehicle.name,
              driverId: event.driver?.id ?? null,
              driverName: event.driver?.name ?? null,
              behaviorLabel: label,
              severity: null,
              maxValue: event.maxAccelerationGForce ?? null,
              time: event.time,
              eventDate: date,
              lat: event.location?.latitude ?? null,
              lon: event.location?.longitude ?? null,
              rawResponse: event as any,
            },
            update: {
              vehicleId: event.vehicle.id,
              vehicleName: event.vehicle.name,
              driverId: event.driver?.id ?? null,
              driverName: event.driver?.name ?? null,
              maxValue: event.maxAccelerationGForce ?? null,
              time: event.time,
              lat: event.location?.latitude ?? null,
              lon: event.location?.longitude ?? null,
              rawResponse: event as any,
            },
          });
          result.newCount++;
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
    if (err?.name?.startsWith('Telematics')) throw err;
    result.errorCount = 1;
    result.errors.push({ recordId: 'safety_events', error: err?.message ?? String(err) });
    console.error(`[Samsara] syncSamsaraSafetyEvents error:`, err?.message ?? String(err));
    return result;
  }
}
