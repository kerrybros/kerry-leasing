-- Fix motive_scorecard_summaries: the correct Motive endpoint is GET /v1/scorecard_summary
-- which returns DRIVER performance rollups, not vehicle data.
-- Replace vehicle columns with driver columns and fix the unique constraint.

-- Drop old vehicle-based unique index and indexes
DROP INDEX IF EXISTS "motive_scorecard_summaries_clerk_org_id_vehicle_id_date_key";
DROP INDEX IF EXISTS "motive_scorecard_summaries_vehicle_id_idx";

-- Remove old vehicle columns
ALTER TABLE "motive_scorecard_summaries"
    DROP COLUMN IF EXISTS "vehicle_id",
    DROP COLUMN IF EXISTS "vehicle_number",
    DROP COLUMN IF EXISTS "vin",
    DROP COLUMN IF EXISTS "speeding_events",
    DROP COLUMN IF EXISTS "safety_score",
    DROP COLUMN IF EXISTS "harsh_braking_events",
    DROP COLUMN IF EXISTS "harsh_accel_events";

-- Add driver columns and correct event columns
ALTER TABLE "motive_scorecard_summaries"
    ADD COLUMN IF NOT EXISTS "driver_id" INTEGER,
    ADD COLUMN IF NOT EXISTS "driver_first_name" TEXT,
    ADD COLUMN IF NOT EXISTS "driver_last_name" TEXT,
    ADD COLUMN IF NOT EXISTS "driver_username" TEXT,
    ADD COLUMN IF NOT EXISTS "driver_email" TEXT,
    ADD COLUMN IF NOT EXISTS "score" DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS "num_coached_events" INTEGER,
    ADD COLUMN IF NOT EXISTS "num_hard_accels" INTEGER,
    ADD COLUMN IF NOT EXISTS "num_hard_brakes" INTEGER,
    ADD COLUMN IF NOT EXISTS "num_hard_corners" INTEGER;

-- Create new driver-based unique index
CREATE UNIQUE INDEX IF NOT EXISTS "motive_scorecard_summaries_clerk_org_id_driver_id_date_key"
    ON "motive_scorecard_summaries"("clerk_org_id", "driver_id", "date");

CREATE INDEX IF NOT EXISTS "motive_scorecard_summaries_driver_id_idx"
    ON "motive_scorecard_summaries"("driver_id");
