-- CreateTable
CREATE TABLE "motive_speeding_events" (
    "id" TEXT NOT NULL,
    "clerk_org_id" TEXT NOT NULL,
    "motive_event_id" BIGINT NOT NULL,
    "driver_id" BIGINT,
    "driver_first_name" TEXT,
    "driver_last_name" TEXT,
    "driver_email" TEXT,
    "vehicle_id" BIGINT,
    "vehicle_number" TEXT,
    "speeding_type" TEXT,
    "severity" TEXT,
    "status" TEXT,
    "coaching_status" TEXT,
    "is_manually_changed" BOOLEAN,
    "duration_sec" INTEGER,
    "speeding_distance_km" DOUBLE PRECISION,
    "max_over_speed_kph" DOUBLE PRECISION,
    "avg_over_speed_kph" DOUBLE PRECISION,
    "min_posted_limit_kph" DOUBLE PRECISION,
    "max_posted_limit_kph" DOUBLE PRECISION,
    "avg_vehicle_speed_kph" DOUBLE PRECISION,
    "max_vehicle_speed_kph" DOUBLE PRECISION,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT,
    "date" TEXT NOT NULL,
    "start_lat" DOUBLE PRECISION,
    "start_lon" DOUBLE PRECISION,
    "end_lat" DOUBLE PRECISION,
    "end_lon" DOUBLE PRECISION,
    "last_verified_at" TIMESTAMP(3),
    "data_version" INTEGER NOT NULL DEFAULT 1,
    "raw_response" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "motive_speeding_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "motive_speeding_events_clerk_org_id_idx" ON "motive_speeding_events"("clerk_org_id");

-- CreateIndex
CREATE INDEX "motive_speeding_events_driver_id_idx" ON "motive_speeding_events"("driver_id");

-- CreateIndex
CREATE INDEX "motive_speeding_events_vehicle_id_idx" ON "motive_speeding_events"("vehicle_id");

-- CreateIndex
CREATE INDEX "motive_speeding_events_date_idx" ON "motive_speeding_events"("date");

-- CreateIndex
CREATE INDEX "motive_speeding_events_clerk_org_id_date_idx" ON "motive_speeding_events"("clerk_org_id", "date");

-- CreateIndex
CREATE INDEX "motive_speeding_events_clerk_org_id_driver_id_date_idx" ON "motive_speeding_events"("clerk_org_id", "driver_id", "date");

-- CreateIndex
CREATE INDEX "motive_speeding_events_last_verified_at_idx" ON "motive_speeding_events"("last_verified_at");

-- CreateIndex
CREATE UNIQUE INDEX "motive_speeding_events_clerk_org_id_motive_event_id_key" ON "motive_speeding_events"("clerk_org_id", "motive_event_id");

