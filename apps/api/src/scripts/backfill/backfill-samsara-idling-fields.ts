/**
 * One-time backfill: extract latitude/longitude/endTime/operatorId/addressId/eventUuid/
 * fuelCostUsd/ptoState from raw_response into proper columns on samsara_idling_events.
 *
 * No API calls. Source of truth is the JSONB already in raw_response.
 *
 * Usage: pnpm exec tsx src/scripts/backfill/backfill-samsara-idling-fields.ts
 *
 * Safe to re-run; the UPDATE is idempotent.
 */

import 'dotenv/config';
import { appPrisma } from '../../lib/prisma.js';

async function main() {
  const before = await appPrisma.samsaraIdlingEvent.count();
  console.log(`Total samsara_idling_events rows: ${before}`);

  // Backfill in one SQL statement — JSONB extraction is fast.
  // end_time = startTime + durationMs, computed in TIMESTAMP space then back to ISO text.
  const result: any = await appPrisma.$executeRawUnsafe(`
    UPDATE samsara_idling_events
    SET
      latitude     = COALESCE(latitude,     CAST(raw_response->>'latitude'  AS DOUBLE PRECISION)),
      longitude    = COALESCE(longitude,    CAST(raw_response->>'longitude' AS DOUBLE PRECISION)),
      event_uuid   = COALESCE(event_uuid,   raw_response->>'eventUuid'),
      operator_id  = COALESCE(operator_id,  raw_response->'operator'->>'id'),
      address_id   = COALESCE(address_id,   raw_response->'address'->>'id'),
      pto_state    = COALESCE(pto_state,    raw_response->>'ptoState'),
      fuel_cost_usd = COALESCE(
        fuel_cost_usd,
        CASE WHEN raw_response->'fuelCost'->>'currency' = 'usd'
             THEN CAST(raw_response->'fuelCost'->>'amount' AS DOUBLE PRECISION)
             ELSE NULL END
      ),
      end_time = COALESCE(
        end_time,
        CASE WHEN duration_milliseconds IS NOT NULL AND start_time IS NOT NULL
             THEN to_char(
               (start_time::timestamptz + (duration_milliseconds || ' milliseconds')::interval)
                 AT TIME ZONE 'UTC',
               'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
             )
             ELSE NULL END
      )
    WHERE raw_response IS NOT NULL
      AND (
        latitude IS NULL OR
        longitude IS NULL OR
        end_time IS NULL OR
        (event_uuid IS NULL  AND raw_response ? 'eventUuid')  OR
        (operator_id IS NULL AND raw_response ? 'operator')   OR
        (address_id IS NULL  AND raw_response ? 'address')    OR
        (pto_state IS NULL   AND raw_response ? 'ptoState')   OR
        (fuel_cost_usd IS NULL AND raw_response ? 'fuelCost')
      );
  `);

  console.log(`Rows updated: ${result}`);

  // Sanity check coverage after backfill.
  const stats: any = await appPrisma.$queryRawUnsafe(`
    SELECT
      count(*)                                            AS total,
      count(latitude)                                     AS with_lat,
      count(longitude)                                    AS with_lon,
      count(end_time)                                     AS with_end_time,
      count(operator_id)                                  AS with_operator,
      count(address_id)                                   AS with_address,
      count(event_uuid)                                   AS with_event_uuid,
      count(fuel_cost_usd)                                AS with_fuel_cost,
      count(pto_state)                                    AS with_pto_state
    FROM samsara_idling_events;
  `);
  console.log('\nPost-backfill coverage:');
  console.table(stats);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await appPrisma.$disconnect();
  });
