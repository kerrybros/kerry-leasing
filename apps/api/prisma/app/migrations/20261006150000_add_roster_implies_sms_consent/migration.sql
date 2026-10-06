-- Roster-as-consent, per customer.
--
-- Kerry's drivers sign a written SMS form at enrollment, so being on the roster
-- IS the consent record. New drivers were landing at PENDING and silently
-- getting no weekly report until someone noticed and bulk-confirmed them.
--
-- Deliberately per-org and defaulting to false: auto-confirming consent is only
-- honest where signed forms are actually on file, and that is a fact about a
-- customer's paperwork, not something to assume globally.
ALTER TABLE "customer_sms_report_configs"
  ADD COLUMN "roster_implies_sms_consent" BOOLEAN NOT NULL DEFAULT false;
