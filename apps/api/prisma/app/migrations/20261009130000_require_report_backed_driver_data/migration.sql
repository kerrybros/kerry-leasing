-- Fail closed on driver data.
--
-- Where set, driver figures for this org may ONLY come from the Motive
-- dashboard report. If no report covers the requested range the API is NOT
-- used as a fallback: the surface returns nothing and says why.
--
-- The Motive API under-counts low speed driving and so inflates idle on yard
-- trucks by 20 to 30 points. A report pulled from a silent fallback would be
-- wrong in a way nobody could see, in front of the customer.
--
-- Defaults false so existing API-backed customers are unaffected.
ALTER TABLE "organization_settings"
  ADD COLUMN "require_report_backed_driver_data" BOOLEAN NOT NULL DEFAULT false;
