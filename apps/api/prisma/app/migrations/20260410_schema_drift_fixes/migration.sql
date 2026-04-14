-- Schema drift fixes: columns and tables added via db push without migrations.
-- Generated from prisma migrate diff output on 2026-04-10.

-- customer_org_maps table (was missing entirely)
CREATE TABLE IF NOT EXISTS "customer_org_maps" (
    "id" TEXT NOT NULL,
    "clerk_org_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_org_maps_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "customer_org_maps_clerk_org_id_key" ON "customer_org_maps"("clerk_org_id");
CREATE INDEX IF NOT EXISTS "customer_org_maps_clerk_org_id_idx" ON "customer_org_maps"("clerk_org_id");

-- organization_settings: additional columns added after initial migration
ALTER TABLE "organization_settings"
    ADD COLUMN IF NOT EXISTS "service_request_url" TEXT,
    ADD COLUMN IF NOT EXISTS "contract_term_years" INTEGER,
    ADD COLUMN IF NOT EXISTS "telematics_dashboard_url" TEXT,
    ADD COLUMN IF NOT EXISTS "telematics_dashboard_username" TEXT,
    ADD COLUMN IF NOT EXISTS "telematics_dashboard_password" TEXT;

ALTER TABLE "organization_settings"
    ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
    ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- Rename index to match Prisma-generated naming convention
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_org_settings_clerk_org_id') THEN
    ALTER INDEX "idx_org_settings_clerk_org_id" RENAME TO "organization_settings_clerk_org_id_idx";
  END IF;
END $$;

-- motive_idle_events: idle_fuel column added after initial migration
ALTER TABLE "motive_idle_events"
    ADD COLUMN IF NOT EXISTS "idle_fuel" DOUBLE PRECISION;

-- Fix updated_at columns: drop DEFAULT CURRENT_TIMESTAMP on tables that use
-- application-level updates (Prisma manages this via @updatedAt)
ALTER TABLE "organization_settings" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "motive_driver_utilization" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "motive_driving_periods" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "motive_geofences" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "motive_idle_events" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "motive_scorecard_summaries" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "motive_vehicle_utilization" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "samsara_safety_events" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "samsara_vehicle_utilization" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "system_config" ALTER COLUMN "updated_at" DROP DEFAULT;

-- Rename unique index on samsara_vehicle_stats_snapshots to match Prisma naming
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'samsara_vehicle_stats_snapshots_clerk_org_id_vehicle_id_capture') THEN
    ALTER INDEX "samsara_vehicle_stats_snapshots_clerk_org_id_vehicle_id_capture"
      RENAME TO "samsara_vehicle_stats_snapshots_clerk_org_id_vehicle_id_cap_key";
  END IF;
END $$;
