/**
 * FETCH IDLING EVENTS
 * Fetches idling events from Samsara for a time range.
 * Used to get idle fuel (fuel consumed during idling) per vehicle per day.
 *
 * Endpoint: GET /idling/events
 * Params: startTime, endTime (RFC 3339), optional vehicleIds, pagination
 * Requires: Read Fuel & Energy on API token
 *
 * Fuel-energy reports only give total fuel + idle duration, not idle fuel.
 * This endpoint provides per-event fuel consumed during idle; we sum by vehicle.
 */

import { SamsaraClient } from '../client.js';

/** Idling event from API - Samsara uses asset.id, fuelConsumedMilliliters, durationMilliseconds */
export interface SamsaraIdlingEvent {
  asset?: { id: number };
  /** Fuel consumed during this idle event (milliliters) */
  fuelConsumedMilliliters?: number;
  /** Duration of this idle event (milliseconds) */
  durationMilliseconds?: number;
  startTime?: string;
  endTime?: string;
  [key: string]: unknown;
}

export interface IdlingEventsSummary {
  fuelMlByVehicle: Map<string, number>;
  durationMsByVehicle: Map<string, number>;
}

/**
 * Fetch all idling events for a time range and return total idle fuel (ml) and total idle duration (ms) per vehicle.
 * Uses startTime/endTime in RFC 3339 (e.g. 2026-02-02T00:00:00Z to 2026-02-02T23:59:59Z).
 * Same day bounds as fuel-energy so idle time can be compared to engineIdleTimeDurationMs.
 */
export async function fetchIdlingEventsSummary(
  client: SamsaraClient,
  startTime: string,
  endTime: string
): Promise<IdlingEventsSummary> {
  const events = await client.get<SamsaraIdlingEvent>('/idling/events', {
    startTime,
    endTime,
    limit: 200, // idling/events max is 200 (other Samsara endpoints allow 512)
  });

  const fuelMlByVehicle = new Map<string, number>();
  const durationMsByVehicle = new Map<string, number>();

  for (const event of events) {
    const assetId = event.asset?.id;
    if (assetId == null) continue;
    const vehicleId = String(assetId);

    const fuelMl = event.fuelConsumedMilliliters ?? 0;
    const durationMs = event.durationMilliseconds ?? 0;

    if (fuelMl > 0) {
      const current = fuelMlByVehicle.get(vehicleId) ?? 0;
      fuelMlByVehicle.set(vehicleId, current + fuelMl);
    }
    if (durationMs > 0) {
      const current = durationMsByVehicle.get(vehicleId) ?? 0;
      durationMsByVehicle.set(vehicleId, current + durationMs);
    }
  }

  return { fuelMlByVehicle, durationMsByVehicle };
}

/**
 * Fetch raw idling events for a time range (no aggregation).
 * Used by sync to store every event as a row in the source table.
 */
export async function fetchIdlingEventsRaw(
  client: SamsaraClient,
  startTime: string,
  endTime: string
): Promise<SamsaraIdlingEvent[]> {
  const events = await client.get<SamsaraIdlingEvent>('/idling/events', {
    startTime,
    endTime,
    limit: 200,
  });
  return events;
}

/**
 * Fetch idling events and return total idle fuel (ml) per vehicle.
 * Used by sync; for duration comparison use fetchIdlingEventsSummary.
 */
export async function fetchIdlingEvents(
  client: SamsaraClient,
  startTime: string,
  endTime: string
): Promise<Map<string, number>> {
  const { fuelMlByVehicle } = await fetchIdlingEventsSummary(client, startTime, endTime);
  return fuelMlByVehicle;
}
