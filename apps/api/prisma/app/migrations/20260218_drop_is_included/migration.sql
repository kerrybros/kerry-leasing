-- Drop is_included column and index; all service plan units are shown in fleet/reports
DROP INDEX IF EXISTS "service_plan_units_is_included_idx";
ALTER TABLE "service_plan_units" DROP COLUMN IF EXISTS "is_included";
