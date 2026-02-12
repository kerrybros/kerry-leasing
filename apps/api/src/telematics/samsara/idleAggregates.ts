/**
 * SAMSARA IDLE AGGREGATES (on read)
 * Aggregates idling events by assetId and date. Link to fuel-energy by assetId = vehicle.id.
 * Source table stores one row per event; we aggregate only when serving API.
 */

export interface IdleAggregate {
  idleFuelMl: number;
  idleDurationMs: number;
}

/**
 * Returns idle fuel (ml) and idle duration (ms) per vehicle per date.
 * Key: date -> vehicleId (assetId) -> aggregate.
 * Use vehicleId from fuel-energy (vehicle.id) to look up; display uses vehicle.name from fuel-energy.
 */
export async function getSamsaraIdleAggregatesByDate(
  prisma: { samsaraIdlingEvent: any },
  clerkOrgId: string,
  dates: string[]
): Promise<Map<string, Map<string, IdleAggregate>>> {
  if (dates.length === 0) return new Map();

  const events = await prisma.samsaraIdlingEvent.findMany({
    where: {
      clerkOrgId,
      eventDate: { in: dates },
    },
    select: {
      eventDate: true,
      assetId: true,
      durationMilliseconds: true,
      fuelConsumedMilliliters: true,
    },
  });

  const byDate = new Map<string, Map<string, IdleAggregate>>();
  for (const d of dates) {
    byDate.set(d, new Map());
  }
  for (const e of events) {
    const agg = byDate.get(e.eventDate) ?? new Map();
    const existing = agg.get(e.assetId) ?? { idleFuelMl: 0, idleDurationMs: 0 };
    agg.set(e.assetId, {
      idleFuelMl: existing.idleFuelMl + (e.fuelConsumedMilliliters ?? 0),
      idleDurationMs: existing.idleDurationMs + (e.durationMilliseconds ?? 0),
    });
    byDate.set(e.eventDate, agg);
  }
  return byDate;
}
