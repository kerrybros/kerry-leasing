-- A2P 10DLC double opt-in / consent tracking.
-- Adds an affirmative SMS consent state to driver_contacts so weekly messages
-- are only sent to drivers who have replied YES to a confirmation text.

-- AlterEnum: new send status for contacts with no verified opt-in.
ALTER TYPE "DriverSmsStatus" ADD VALUE 'NO_CONSENT';

-- CreateEnum: SMS consent state machine.
CREATE TYPE "DriverSmsConsentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'DECLINED');

-- AlterTable: per-driver SMS consent + audit trail.
-- Existing rows default to PENDING: they will NOT be messaged until they reply YES
-- to the double opt-in confirmation (backfill via the send-opt-in admin action).
ALTER TABLE "driver_contacts"
  ADD COLUMN "sms_consent_status" "DriverSmsConsentStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "sms_consent_requested_at" TIMESTAMP(3),
  ADD COLUMN "sms_consent_confirmed_at" TIMESTAMP(3),
  ADD COLUMN "sms_consent_method" TEXT,
  ADD COLUMN "sms_consent_confirmation_sid" TEXT,
  ADD COLUMN "sms_consent_reply_sid" TEXT,
  ADD COLUMN "sms_consent_reply_body" TEXT;
