-- CreateEnum
CREATE TYPE "UnitType" AS ENUM ('TRACTOR', 'TRAILER', 'SWITCHER', 'BOX_TRUCK', 'AUTO', 'MISC');

-- AlterTable
ALTER TABLE "service_plan_units" ADD COLUMN "unit_type" "UnitType";
