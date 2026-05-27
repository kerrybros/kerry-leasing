-- Add backdate observability to telematics_provider_accounts.
--
-- backdate_status surfaces whether a backfill is in-flight, completed, or
-- failed; backdate_started_at lets the UI compute elapsed time and detect
-- stuck runs (process died mid-loop) without needing a server-side reaper.
-- Existing last_backdate_report JSON still carries the per-run detail.

CREATE TYPE "BackdateStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

ALTER TABLE "telematics_provider_accounts"
  ADD COLUMN "backdate_status"     "BackdateStatus",
  ADD COLUMN "backdate_started_at" TIMESTAMP(3);
