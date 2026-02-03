-- CreateEnum
CREATE TYPE "TelematicsProvider" AS ENUM ('SAMSARA', 'MOTIVE');

-- CreateEnum
CREATE TYPE "TelematicsProviderStatus" AS ENUM ('ACTIVE', 'ERROR', 'DISABLED');

-- Drop old tables if they exist (placeholders)
DROP TABLE IF EXISTS "telematics_accounts";
DROP TABLE IF EXISTS "telematics_daily_metrics";

-- CreateTable: TelematicsProviderAccount
CREATE TABLE "telematics_provider_accounts" (
    "id" TEXT NOT NULL,
    "clerk_org_id" TEXT NOT NULL,
    "provider" "TelematicsProvider" NOT NULL,
    "credentials_json" JSONB NOT NULL,
    "status" "TelematicsProviderStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_sync_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "telematics_provider_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable: TelematicsVehicleMap
CREATE TABLE "telematics_vehicle_maps" (
    "id" TEXT NOT NULL,
    "clerk_org_id" TEXT NOT NULL,
    "vin" TEXT NOT NULL,
    "provider" "TelematicsProvider" NOT NULL,
    "provider_vehicle_id" TEXT NOT NULL,
    "provider_vehicle_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "telematics_vehicle_maps_pkey" PRIMARY KEY ("id")
);

-- CreateTable: TelematicsDailyMetric
CREATE TABLE "telematics_daily_metrics" (
    "id" TEXT NOT NULL,
    "clerk_org_id" TEXT NOT NULL,
    "vin" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "miles_driven" DOUBLE PRECISION,
    "idle_minutes" DOUBLE PRECISION,
    "fuel_gallons" DOUBLE PRECISION,
    "avg_mpg" DOUBLE PRECISION,
    "engine_hours" DOUBLE PRECISION,
    "source" "TelematicsProvider" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "telematics_daily_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "telematics_provider_accounts_clerk_org_id_key" ON "telematics_provider_accounts"("clerk_org_id");

-- CreateIndex
CREATE INDEX "telematics_provider_accounts_clerk_org_id_idx" ON "telematics_provider_accounts"("clerk_org_id");

-- CreateIndex
CREATE INDEX "telematics_provider_accounts_status_idx" ON "telematics_provider_accounts"("status");

-- CreateIndex
CREATE INDEX "telematics_vehicle_maps_clerk_org_id_idx" ON "telematics_vehicle_maps"("clerk_org_id");

-- CreateIndex
CREATE INDEX "telematics_vehicle_maps_vin_idx" ON "telematics_vehicle_maps"("vin");

-- CreateIndex
CREATE INDEX "telematics_vehicle_maps_provider_vehicle_id_idx" ON "telematics_vehicle_maps"("provider_vehicle_id");

-- CreateIndex
CREATE UNIQUE INDEX "telematics_vehicle_maps_clerk_org_id_provider_provider_v_key" ON "telematics_vehicle_maps"("clerk_org_id", "provider", "provider_vehicle_id");

-- CreateIndex
CREATE UNIQUE INDEX "telematics_vehicle_maps_clerk_org_id_vin_key" ON "telematics_vehicle_maps"("clerk_org_id", "vin");

-- CreateIndex
CREATE INDEX "telematics_daily_metrics_clerk_org_id_idx" ON "telematics_daily_metrics"("clerk_org_id");

-- CreateIndex
CREATE INDEX "telematics_daily_metrics_vin_idx" ON "telematics_daily_metrics"("vin");

-- CreateIndex
CREATE INDEX "telematics_daily_metrics_date_idx" ON "telematics_daily_metrics"("date");

-- CreateIndex
CREATE INDEX "telematics_daily_metrics_clerk_org_id_date_idx" ON "telematics_daily_metrics"("clerk_org_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "telematics_daily_metrics_clerk_org_id_vin_date_key" ON "telematics_daily_metrics"("clerk_org_id", "vin", "date");
