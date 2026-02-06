-- CreateEnum
CREATE TYPE "ServicePlanMatchType" AS ENUM ('AUTO', 'MANUAL', 'UNMATCHED');

-- CreateTable
CREATE TABLE "service_plan_units" (
    "id" TEXT NOT NULL,
    "clerk_org_id" TEXT NOT NULL,
    "repair_unit_id" TEXT NOT NULL,
    "repair_unit_number" TEXT,
    "repair_vin" TEXT,
    "repair_customer_id" TEXT,
    "telematics_vin" TEXT,
    "match_type" "ServicePlanMatchType" NOT NULL DEFAULT 'UNMATCHED',
    "match_confidence" DOUBLE PRECISION,
    "is_included" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "matched_by" TEXT,
    "matched_at" TIMESTAMP(3),
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_plan_units_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "service_plan_units_clerk_org_id_idx" ON "service_plan_units"("clerk_org_id");

-- CreateIndex
CREATE INDEX "service_plan_units_is_included_idx" ON "service_plan_units"("is_included");

-- CreateIndex
CREATE INDEX "service_plan_units_match_type_idx" ON "service_plan_units"("match_type");

-- CreateIndex
CREATE INDEX "service_plan_units_repair_vin_idx" ON "service_plan_units"("repair_vin");

-- CreateIndex
CREATE INDEX "service_plan_units_telematics_vin_idx" ON "service_plan_units"("telematics_vin");

-- CreateIndex
CREATE UNIQUE INDEX "service_plan_units_clerk_org_id_repair_unit_id_key" ON "service_plan_units"("clerk_org_id", "repair_unit_id");
