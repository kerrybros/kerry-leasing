-- AlterEnum
-- Status for a driver who has no email on file when the EMAIL channel is selected.
ALTER TYPE "DriverSmsStatus" ADD VALUE 'NO_EMAIL';

-- AlterTable: per-org delivery channel selection.
-- JSONB string[] of SMS | EMAIL. NULL = ["SMS"] (backward compatible with existing rows).
ALTER TABLE "customer_sms_report_configs" ADD COLUMN     "channels" JSONB;

-- AlterTable: per-driver email opt-out, independent of the SMS STOP opt-out (opted_out).
ALTER TABLE "driver_contacts" ADD COLUMN     "email_opted_out" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "email_opted_out_at" TIMESTAMP(3);

-- AlterTable: per-send delivery channel. Existing rows are all SMS.
ALTER TABLE "driver_weekly_reports_sent" ADD COLUMN     "channel" TEXT NOT NULL DEFAULT 'SMS';

-- Re-key idempotency to include channel so SMS + EMAIL sends for the same
-- (org, driver, week) can coexist as separate rows.
DROP INDEX "driver_weekly_reports_sent_clerk_org_id_driver_contact_id_w_key";
CREATE UNIQUE INDEX "driver_weekly_reports_sent_org_driver_week_channel_key" ON "driver_weekly_reports_sent"("clerk_org_id", "driver_contact_id", "week_start_date", "channel");
