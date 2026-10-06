-- Customer-facing name for the weekly report, used in the email subject.
-- Per-org rather than an env var, because a second customer on the same
-- deployment must not inherit the first one's name in their subject line.
ALTER TABLE "customer_sms_report_configs"
  ADD COLUMN "report_display_name" TEXT;
