-- CreateTable
CREATE TABLE "samsara_driver_fuel_energy" (
    "id" TEXT NOT NULL,
    "clerk_org_id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "driver_name" TEXT,
    "driver_external_id" TEXT,
    "date" TEXT NOT NULL,
    "total_distance_miles" DOUBLE PRECISION,
    "total_fuel_used_gallons" DOUBLE PRECISION,
    "engine_idle_fuel_gallons" DOUBLE PRECISION,
    "engine_run_time_ms" BIGINT,
    "engine_idle_time_ms" BIGINT,
    "raw_response" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "samsara_driver_fuel_energy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "samsara_driver_efficiency" (
    "id" TEXT NOT NULL,
    "clerk_org_id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "driver_name" TEXT,
    "driver_external_id" TEXT,
    "date" TEXT NOT NULL,
    "overall_safety_score" DOUBLE PRECISION,
    "speeding_score" DOUBLE PRECISION,
    "harsh_braking_score" DOUBLE PRECISION,
    "harsh_accel_score" DOUBLE PRECISION,
    "harsh_braking_count" INTEGER,
    "harsh_accel_count" INTEGER,
    "harsh_turn_count" INTEGER,
    "speeding_count" INTEGER,
    "total_distance_miles" DOUBLE PRECISION,
    "raw_response" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "samsara_driver_efficiency_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "samsara_driver_fuel_energy_clerk_org_id_idx" ON "samsara_driver_fuel_energy"("clerk_org_id");

-- CreateIndex
CREATE INDEX "samsara_driver_fuel_energy_clerk_org_id_date_idx" ON "samsara_driver_fuel_energy"("clerk_org_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "samsara_driver_fuel_energy_clerk_org_id_driver_id_date_key" ON "samsara_driver_fuel_energy"("clerk_org_id", "driver_id", "date");

-- CreateIndex
CREATE INDEX "samsara_driver_efficiency_clerk_org_id_idx" ON "samsara_driver_efficiency"("clerk_org_id");

-- CreateIndex
CREATE INDEX "samsara_driver_efficiency_clerk_org_id_date_idx" ON "samsara_driver_efficiency"("clerk_org_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "samsara_driver_efficiency_clerk_org_id_driver_id_date_key" ON "samsara_driver_efficiency"("clerk_org_id", "driver_id", "date");
