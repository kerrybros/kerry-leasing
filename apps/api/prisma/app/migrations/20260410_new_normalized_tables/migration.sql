-- Catch-up migration: creates 6 tables that were applied via `prisma db push`
-- without migration files. All tables are part of the new normalized architecture.
-- Generated: 2026-04-10

-- =====================================================
-- TABLE 1: TELEMATICS VEHICLE MAPS
-- Maps provider vehicle IDs to VINs for cross-referencing
-- =====================================================
CREATE TABLE IF NOT EXISTS "telematics_vehicle_maps" (
    "id" TEXT NOT NULL,
    "clerk_org_id" TEXT NOT NULL,
    "vin" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_vehicle_id" TEXT NOT NULL,
    "provider_vehicle_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telematics_vehicle_maps_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "telematics_vehicle_maps_clerk_org_id_provider_provider_vehicle_id_key"
    ON "telematics_vehicle_maps"("clerk_org_id", "provider", "provider_vehicle_id");
CREATE UNIQUE INDEX IF NOT EXISTS "telematics_vehicle_maps_clerk_org_id_vin_key"
    ON "telematics_vehicle_maps"("clerk_org_id", "vin");
CREATE INDEX IF NOT EXISTS "telematics_vehicle_maps_clerk_org_id_idx"
    ON "telematics_vehicle_maps"("clerk_org_id");
CREATE INDEX IF NOT EXISTS "telematics_vehicle_maps_vin_idx"
    ON "telematics_vehicle_maps"("vin");
CREATE INDEX IF NOT EXISTS "telematics_vehicle_maps_provider_vehicle_id_idx"
    ON "telematics_vehicle_maps"("provider_vehicle_id");

-- =====================================================
-- TABLE 2: SAMSARA VEHICLE UTILIZATION
-- Normalized daily vehicle metrics from Samsara fuel-energy reports.
-- All units converted at write time: mL→gal, meters→miles, ms→min.
-- =====================================================
CREATE TABLE IF NOT EXISTS "samsara_vehicle_utilization" (
    "id" TEXT NOT NULL,
    "clerk_org_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "vehicle_name" TEXT,
    "vin" TEXT,
    "date" TEXT NOT NULL,
    "fuel_gallons" DOUBLE PRECISION,
    "distance_miles" DOUBLE PRECISION,
    "engine_on_minutes" DOUBLE PRECISION,
    "driving_minutes" DOUBLE PRECISION,
    "idle_minutes" DOUBLE PRECISION,
    "idle_fuel_gallons" DOUBLE PRECISION,
    "mpg" DOUBLE PRECISION,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "samsara_vehicle_utilization_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "samsara_vehicle_utilization_clerk_org_id_vehicle_id_date_key"
    ON "samsara_vehicle_utilization"("clerk_org_id", "vehicle_id", "date");
CREATE INDEX IF NOT EXISTS "samsara_vehicle_utilization_clerk_org_id_idx"
    ON "samsara_vehicle_utilization"("clerk_org_id");
CREATE INDEX IF NOT EXISTS "samsara_vehicle_utilization_vehicle_id_idx"
    ON "samsara_vehicle_utilization"("vehicle_id");
CREATE INDEX IF NOT EXISTS "samsara_vehicle_utilization_date_idx"
    ON "samsara_vehicle_utilization"("date");
CREATE INDEX IF NOT EXISTS "samsara_vehicle_utilization_clerk_org_id_date_idx"
    ON "samsara_vehicle_utilization"("clerk_org_id", "date");

-- =====================================================
-- TABLE 3: SAMSARA VEHICLE STATS SNAPSHOTS
-- OBD + GPS point-in-time stats (odometer, engine hours).
-- Source: GET /fleet/vehicles/stats
-- =====================================================
CREATE TABLE IF NOT EXISTS "samsara_vehicle_stats_snapshots" (
    "id" TEXT NOT NULL,
    "clerk_org_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "vehicle_name" TEXT,
    "captured_at" TIMESTAMP(3) NOT NULL,
    "obd_odometer_meters" DOUBLE PRECISION,
    "obd_engine_seconds" DOUBLE PRECISION,
    "gps_odometer_meters" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "samsara_vehicle_stats_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "samsara_vehicle_stats_snapshots_clerk_org_id_vehicle_id_captured_at_key"
    ON "samsara_vehicle_stats_snapshots"("clerk_org_id", "vehicle_id", "captured_at");
CREATE INDEX IF NOT EXISTS "samsara_vehicle_stats_snapshots_clerk_org_id_idx"
    ON "samsara_vehicle_stats_snapshots"("clerk_org_id");
CREATE INDEX IF NOT EXISTS "samsara_vehicle_stats_snapshots_vehicle_id_idx"
    ON "samsara_vehicle_stats_snapshots"("vehicle_id");
CREATE INDEX IF NOT EXISTS "samsara_vehicle_stats_snapshots_captured_at_idx"
    ON "samsara_vehicle_stats_snapshots"("captured_at");

-- =====================================================
-- TABLE 4: SAMSARA SAFETY EVENTS
-- One row per harsh driving event.
-- Source: GET /fleet/safety-events
-- =====================================================
CREATE TABLE IF NOT EXISTS "samsara_safety_events" (
    "id" TEXT NOT NULL,
    "clerk_org_id" TEXT NOT NULL,
    "samsara_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "vehicle_name" TEXT,
    "driver_id" TEXT,
    "driver_name" TEXT,
    "behavior_label" TEXT NOT NULL,
    "severity" TEXT,
    "max_value" DOUBLE PRECISION,
    "time" TEXT NOT NULL,
    "event_date" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lon" DOUBLE PRECISION,
    "raw_response" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "samsara_safety_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "samsara_safety_events_clerk_org_id_samsara_id_key"
    ON "samsara_safety_events"("clerk_org_id", "samsara_id");
CREATE INDEX IF NOT EXISTS "samsara_safety_events_clerk_org_id_idx"
    ON "samsara_safety_events"("clerk_org_id");
CREATE INDEX IF NOT EXISTS "samsara_safety_events_vehicle_id_idx"
    ON "samsara_safety_events"("vehicle_id");
CREATE INDEX IF NOT EXISTS "samsara_safety_events_event_date_idx"
    ON "samsara_safety_events"("event_date");
CREATE INDEX IF NOT EXISTS "samsara_safety_events_clerk_org_id_event_date_idx"
    ON "samsara_safety_events"("clerk_org_id", "event_date");

-- =====================================================
-- TABLE 5: MOTIVE SCORECARD SUMMARIES
-- Per-vehicle safety scores.
-- Source: GET /v1/vehicle_scorecard_summaries
-- =====================================================
CREATE TABLE IF NOT EXISTS "motive_scorecard_summaries" (
    "id" TEXT NOT NULL,
    "clerk_org_id" TEXT NOT NULL,
    "vehicle_id" INTEGER,
    "vehicle_number" TEXT,
    "vin" TEXT,
    "date" TEXT NOT NULL,
    "safety_score" DOUBLE PRECISION,
    "speeding_events" INTEGER,
    "harsh_braking_events" INTEGER,
    "harsh_accel_events" INTEGER,
    "total_kilometers" DOUBLE PRECISION,
    "raw_response" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "motive_scorecard_summaries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "motive_scorecard_summaries_clerk_org_id_vehicle_id_date_key"
    ON "motive_scorecard_summaries"("clerk_org_id", "vehicle_id", "date");
CREATE INDEX IF NOT EXISTS "motive_scorecard_summaries_clerk_org_id_idx"
    ON "motive_scorecard_summaries"("clerk_org_id");
CREATE INDEX IF NOT EXISTS "motive_scorecard_summaries_vehicle_id_idx"
    ON "motive_scorecard_summaries"("vehicle_id");
CREATE INDEX IF NOT EXISTS "motive_scorecard_summaries_date_idx"
    ON "motive_scorecard_summaries"("date");

-- =====================================================
-- TABLE 6: SYSTEM CONFIG
-- Key-value store for app-wide settings (EIA diesel price, feature flags).
-- =====================================================
CREATE TABLE IF NOT EXISTS "system_config" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_config_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "system_config_key_key"
    ON "system_config"("key");
