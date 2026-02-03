-- Drop generic raw data table (from previous migration)
DROP TABLE IF EXISTS "telematics_raw_data";

-- CreateTable: SamsaraRawData (Samsara-specific schema)
CREATE TABLE "samsara_raw_data" (
    "id" TEXT NOT NULL,
    "clerk_org_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "vin" TEXT,
    "vehicle_name" TEXT,
    "date" TEXT NOT NULL,
    "start_time" TEXT,
    "end_time" TEXT,
    "odometer_start" DOUBLE PRECISION,
    "odometer_end" DOUBLE PRECISION,
    "fuel_consumed_start" DOUBLE PRECISION,
    "fuel_consumed_end" DOUBLE PRECISION,
    "idle_duration_start" DOUBLE PRECISION,
    "idle_duration_end" DOUBLE PRECISION,
    "engine_hours_start" DOUBLE PRECISION,
    "engine_hours_end" DOUBLE PRECISION,
    "raw_response" JSONB NOT NULL,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "samsara_raw_data_pkey" PRIMARY KEY ("id")
);

-- CreateTable: MotiveRawData (Motive-specific schema)
CREATE TABLE "motive_raw_data" (
    "id" TEXT NOT NULL,
    "clerk_org_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "vin" TEXT,
    "vehicle_number" TEXT,
    "vehicle_name" TEXT,
    "date" TEXT NOT NULL,
    "ifta_total_miles" DOUBLE PRECISION,
    "ifta_start_date" TEXT,
    "ifta_end_date" TEXT,
    "total_engine_duration" DOUBLE PRECISION,
    "total_idle_duration" DOUBLE PRECISION,
    "total_driving_duration" DOUBLE PRECISION,
    "ifta_raw_response" JSONB,
    "utilization_raw_response" JSONB,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "motive_raw_data_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "samsara_raw_data_clerk_org_id_vehicle_id_date_key" ON "samsara_raw_data"("clerk_org_id", "vehicle_id", "date");
CREATE INDEX "samsara_raw_data_clerk_org_id_idx" ON "samsara_raw_data"("clerk_org_id");
CREATE INDEX "samsara_raw_data_vehicle_id_idx" ON "samsara_raw_data"("vehicle_id");
CREATE INDEX "samsara_raw_data_vin_idx" ON "samsara_raw_data"("vin");
CREATE INDEX "samsara_raw_data_date_idx" ON "samsara_raw_data"("date");
CREATE INDEX "samsara_raw_data_clerk_org_id_date_idx" ON "samsara_raw_data"("clerk_org_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "motive_raw_data_clerk_org_id_vehicle_id_date_key" ON "motive_raw_data"("clerk_org_id", "vehicle_id", "date");
CREATE INDEX "motive_raw_data_clerk_org_id_idx" ON "motive_raw_data"("clerk_org_id");
CREATE INDEX "motive_raw_data_vehicle_id_idx" ON "motive_raw_data"("vehicle_id");
CREATE INDEX "motive_raw_data_vin_idx" ON "motive_raw_data"("vin");
CREATE INDEX "motive_raw_data_date_idx" ON "motive_raw_data"("date");
CREATE INDEX "motive_raw_data_clerk_org_id_date_idx" ON "motive_raw_data"("clerk_org_id", "date");

-- AlterTable: Update telematics_daily_metrics
ALTER TABLE "telematics_daily_metrics" DROP COLUMN IF EXISTS "raw_data_id";
ALTER TABLE "telematics_daily_metrics" ADD COLUMN "samsara_raw_data_id" TEXT;
ALTER TABLE "telematics_daily_metrics" ADD COLUMN "motive_raw_data_id" TEXT;

-- CreateIndex
CREATE INDEX "telematics_daily_metrics_samsara_raw_data_id_idx" ON "telematics_daily_metrics"("samsara_raw_data_id");
CREATE INDEX "telematics_daily_metrics_motive_raw_data_id_idx" ON "telematics_daily_metrics"("motive_raw_data_id");
