-- Redesign samsara_raw_data: replace 10 null delta-pair columns with typed columns
-- that match what the Samsara Fuel Energy Reports API actually returns (totals, not deltas).

-- Add new typed columns (nullable to allow gradual backfill of existing rows)
ALTER TABLE samsara_raw_data
  ADD COLUMN IF NOT EXISTS distance_traveled_meters    DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS fuel_consumed_ml            DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS engine_run_time_duration_ms BIGINT,
  ADD COLUMN IF NOT EXISTS engine_idle_time_duration_ms BIGINT,
  ADD COLUMN IF NOT EXISTS efficiency_mpge             DOUBLE PRECISION;

-- Drop the old delta-pair columns that were never populated
ALTER TABLE samsara_raw_data
  DROP COLUMN IF EXISTS start_time,
  DROP COLUMN IF EXISTS end_time,
  DROP COLUMN IF EXISTS odometer_start,
  DROP COLUMN IF EXISTS odometer_end,
  DROP COLUMN IF EXISTS fuel_consumed_start,
  DROP COLUMN IF EXISTS fuel_consumed_end,
  DROP COLUMN IF EXISTS idle_duration_start,
  DROP COLUMN IF EXISTS idle_duration_end,
  DROP COLUMN IF EXISTS engine_hours_start,
  DROP COLUMN IF EXISTS engine_hours_end;
