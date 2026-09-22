-- Motive dashboard report intake.
-- Motive confirmed (support case 11057761) that the v2/driver_utilization API and
-- the Fleet Dashboard "Driver Fuel Performance" report use different calculation
-- models and that the report is the source of truth. The report is scheduled in
-- Motive, emailed as CSV to a shared mailbox, and ingested into these tables.
-- Additive only: no existing table or row is modified.

-- AlterEnum: new cron job type for the mailbox ingest job.
ALTER TYPE "CronJobType" ADD VALUE 'MOTIVE_REPORT_INGEST';

-- CreateEnum
CREATE TYPE "MotiveReportSource" AS ENUM ('SCHEDULED_EMAIL', 'MANUAL_IMPORT', 'PORTAL_PULL');
CREATE TYPE "MotiveReportGranularity" AS ENUM ('DAY', 'WEEK', 'MONTH', 'CUSTOM');
CREATE TYPE "MotiveReportIngestStatus" AS ENUM ('ACCEPTED', 'UNVERIFIED');

-- AlterTable: route inbound report emails to an org by the company name in the email.
ALTER TABLE "telematics_provider_accounts"
  ADD COLUMN "motive_report_company_name" TEXT;

-- CreateTable: one row per ingested file, raw CSV kept for audit.
CREATE TABLE "motive_report_ingests" (
    "id" TEXT NOT NULL,
    "clerk_org_id" TEXT NOT NULL,
    "source" "MotiveReportSource" NOT NULL,
    "source_ref" TEXT NOT NULL,
    "report_name" TEXT,
    "subject" TEXT,
    "attachment_name" TEXT,
    "received_at" TIMESTAMP(3),
    "window_start" TEXT NOT NULL,
    "window_end" TEXT NOT NULL,
    "granularity" "MotiveReportGranularity" NOT NULL,
    "status" "MotiveReportIngestStatus" NOT NULL DEFAULT 'ACCEPTED',
    "status_reason" TEXT,
    "label_start" TEXT,
    "label_end" TEXT,
    "row_count" INTEGER NOT NULL,
    "raw_csv" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "motive_report_ingests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "motive_report_ingests_source_ref_key" ON "motive_report_ingests"("source_ref");
CREATE INDEX "motive_report_ingests_clerk_org_id_window_start_window_end_idx" ON "motive_report_ingests"("clerk_org_id", "window_start", "window_end");
CREATE INDEX "motive_report_ingests_clerk_org_id_status_idx" ON "motive_report_ingests"("clerk_org_id", "status");

-- CreateTable: one row per (driver, vehicle) line in an export. Times in minutes as exported.
CREATE TABLE "motive_report_driver_fuel_performance" (
    "id" TEXT NOT NULL,
    "clerk_org_id" TEXT NOT NULL,
    "ingest_id" TEXT NOT NULL,
    "window_start" TEXT NOT NULL,
    "window_end" TEXT NOT NULL,
    "driver_name" TEXT NOT NULL,
    "driver_normalized_name" TEXT NOT NULL,
    "motive_driver_id" INTEGER,
    "driver_company_id" TEXT,
    "group_name" TEXT,
    "vehicle_name" TEXT NOT NULL,
    "avg_mpg" DOUBLE PRECISION,
    "moving_mpg" DOUBLE PRECISION,
    "total_distance_mi" DOUBLE PRECISION,
    "total_fuel_gal" DOUBLE PRECISION,
    "carbon_lbs" DOUBLE PRECISION,
    "utilization_pct" DOUBLE PRECISION,
    "driving_time_min" DOUBLE PRECISION,
    "driving_fuel_gal" DOUBLE PRECISION,
    "idling_time_min" DOUBLE PRECISION,
    "idled_fuel_gal" DOUBLE PRECISION,
    "over_rpm_pct" DOUBLE PRECISION,
    "avg_speed_mph" DOUBLE PRECISION,
    "fuel_cost_usd" DOUBLE PRECISION,
    "cruise_distance_pct" DOUBLE PRECISION,
    "cruise_time_pct" DOUBLE PRECISION,
    "hard_braking_per_1k_mi" DOUBLE PRECISION,
    "hard_accel_per_1k_mi" DOUBLE PRECISION,
    "hard_cornering_per_1k_mi" DOUBLE PRECISION,
    "raw_row" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "motive_report_driver_fuel_performance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "motive_report_driver_fuel_performance_clerk_org_id_window_s_key" ON "motive_report_driver_fuel_performance"("clerk_org_id", "window_start", "window_end", "driver_normalized_name", "vehicle_name");
CREATE INDEX "motive_report_driver_fuel_performance_clerk_org_id_window_s_idx" ON "motive_report_driver_fuel_performance"("clerk_org_id", "window_start", "window_end");
CREATE INDEX "motive_report_driver_fuel_performance_clerk_org_id_motive_d_idx" ON "motive_report_driver_fuel_performance"("clerk_org_id", "motive_driver_id");

-- AddForeignKey
ALTER TABLE "motive_report_driver_fuel_performance"
  ADD CONSTRAINT "motive_report_driver_fuel_performance_ingest_id_fkey"
  FOREIGN KEY ("ingest_id") REFERENCES "motive_report_ingests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
