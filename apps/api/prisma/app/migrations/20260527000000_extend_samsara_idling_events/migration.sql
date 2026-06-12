-- Extend SamsaraIdlingEvent with fields already present in raw_response.
-- These are added so the IDLE map can render Samsara events the same way Motive does.
-- All values backfilled from raw_response in a separate script.

ALTER TABLE "samsara_idling_events"
  ADD COLUMN "latitude"      DOUBLE PRECISION,
  ADD COLUMN "longitude"     DOUBLE PRECISION,
  ADD COLUMN "end_time"      TEXT,
  ADD COLUMN "operator_id"   TEXT,
  ADD COLUMN "address_id"    TEXT,
  ADD COLUMN "event_uuid"    TEXT,
  ADD COLUMN "fuel_cost_usd" DOUBLE PRECISION,
  ADD COLUMN "pto_state"     TEXT;
