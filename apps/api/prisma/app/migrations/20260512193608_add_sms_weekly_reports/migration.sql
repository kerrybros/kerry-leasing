-- CreateEnum
CREATE TYPE "DriverContactSource" AS ENUM ('WHIPAROUND_SYNC', 'MANUAL');

-- CreateEnum
CREATE TYPE "DriverSmsStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'OPTED_OUT', 'NO_PHONE', 'SKIPPED');

-- CreateEnum
CREATE TYPE "TwilioInboundEventType" AS ENUM ('INBOUND_STOP', 'INBOUND_START', 'STATUS_CALLBACK');

-- AlterEnum
ALTER TYPE "CronJobType" ADD VALUE 'SMS_WEEKLY_DRIVER_REPORT';

-- CreateTable
CREATE TABLE "customer_sms_report_configs" (
    "id" TEXT NOT NULL,
    "clerk_org_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "kpis" JSONB NOT NULL,
    "send_hour_et" INTEGER NOT NULL DEFAULT 5,
    "last_sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_sms_report_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_contacts" (
    "id" TEXT NOT NULL,
    "clerk_org_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "phone_e164" TEXT,
    "motive_driver_id" INTEGER,
    "whiparound_driver_id" INTEGER,
    "source" "DriverContactSource" NOT NULL,
    "enrolled" BOOLEAN NOT NULL DEFAULT true,
    "opted_out" BOOLEAN NOT NULL DEFAULT false,
    "opted_out_at" TIMESTAMP(3),
    "last_twilio_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "driver_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_weekly_reports_sent" (
    "id" TEXT NOT NULL,
    "clerk_org_id" TEXT NOT NULL,
    "driver_contact_id" TEXT NOT NULL,
    "week_start_date" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL,
    "status" "DriverSmsStatus" NOT NULL,
    "twilio_sid" TEXT,
    "twilio_error_code" TEXT,
    "token" TEXT NOT NULL,
    "token_expires_at" TIMESTAMP(3) NOT NULL,
    "kpi_snapshot" JSONB NOT NULL,
    "body_preview" TEXT,
    "is_test" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_weekly_reports_sent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "twilio_inbound_log" (
    "id" TEXT NOT NULL,
    "event_type" "TwilioInboundEventType" NOT NULL,
    "from_phone" TEXT,
    "to_phone" TEXT,
    "message_sid" TEXT,
    "message_status" TEXT,
    "error_code" TEXT,
    "body" TEXT,
    "raw" JSONB NOT NULL,
    "matched_driver_contact_id" TEXT,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "twilio_inbound_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customer_sms_report_configs_clerk_org_id_key" ON "customer_sms_report_configs"("clerk_org_id");

-- CreateIndex
CREATE INDEX "customer_sms_report_configs_clerk_org_id_idx" ON "customer_sms_report_configs"("clerk_org_id");

-- CreateIndex
CREATE INDEX "customer_sms_report_configs_enabled_idx" ON "customer_sms_report_configs"("enabled");

-- CreateIndex
CREATE INDEX "driver_contacts_clerk_org_id_idx" ON "driver_contacts"("clerk_org_id");

-- CreateIndex
CREATE INDEX "driver_contacts_motive_driver_id_idx" ON "driver_contacts"("motive_driver_id");

-- CreateIndex
CREATE INDEX "driver_contacts_whiparound_driver_id_idx" ON "driver_contacts"("whiparound_driver_id");

-- CreateIndex
CREATE UNIQUE INDEX "driver_contacts_clerk_org_id_normalized_name_key" ON "driver_contacts"("clerk_org_id", "normalized_name");

-- CreateIndex
CREATE UNIQUE INDEX "driver_contacts_clerk_org_id_phone_e164_key" ON "driver_contacts"("clerk_org_id", "phone_e164");

-- CreateIndex
CREATE UNIQUE INDEX "driver_weekly_reports_sent_token_key" ON "driver_weekly_reports_sent"("token");

-- CreateIndex
CREATE INDEX "driver_weekly_reports_sent_clerk_org_id_week_start_date_idx" ON "driver_weekly_reports_sent"("clerk_org_id", "week_start_date" DESC);

-- CreateIndex
CREATE INDEX "driver_weekly_reports_sent_driver_contact_id_idx" ON "driver_weekly_reports_sent"("driver_contact_id");

-- CreateIndex
CREATE INDEX "driver_weekly_reports_sent_token_idx" ON "driver_weekly_reports_sent"("token");

-- CreateIndex
CREATE INDEX "driver_weekly_reports_sent_twilio_sid_idx" ON "driver_weekly_reports_sent"("twilio_sid");

-- CreateIndex
CREATE UNIQUE INDEX "driver_weekly_reports_sent_clerk_org_id_driver_contact_id_w_key" ON "driver_weekly_reports_sent"("clerk_org_id", "driver_contact_id", "week_start_date");

-- CreateIndex
CREATE INDEX "twilio_inbound_log_message_sid_idx" ON "twilio_inbound_log"("message_sid");

-- CreateIndex
CREATE INDEX "twilio_inbound_log_from_phone_idx" ON "twilio_inbound_log"("from_phone");

-- CreateIndex
CREATE INDEX "twilio_inbound_log_created_at_idx" ON "twilio_inbound_log"("created_at" DESC);
