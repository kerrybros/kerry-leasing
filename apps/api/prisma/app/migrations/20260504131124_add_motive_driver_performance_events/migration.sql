-- CreateTable
CREATE TABLE "motive_driver_performance_events" (
    "id" TEXT NOT NULL,
    "clerk_org_id" TEXT NOT NULL,
    "motive_event_id" BIGINT NOT NULL,
    "driver_id" BIGINT,
    "driver_first_name" TEXT,
    "driver_last_name" TEXT,
    "driver_username" TEXT,
    "driver_email" TEXT,
    "vehicle_id" BIGINT,
    "vehicle_number" TEXT,
    "vehicle_vin" TEXT,
    "event_type" TEXT NOT NULL,
    "primary_behaviors" JSONB,
    "secondary_behaviors" JSONB,
    "severity" TEXT,
    "intensity" TEXT,
    "duration" INTEGER,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT,
    "date" TEXT NOT NULL,
    "start_speed" DOUBLE PRECISION,
    "end_speed" DOUBLE PRECISION,
    "max_speed" DOUBLE PRECISION,
    "lat" DOUBLE PRECISION,
    "lon" DOUBLE PRECISION,
    "location" TEXT,
    "coaching_status" TEXT,
    "coached_at" TEXT,
    "camera_media_available" BOOLEAN,
    "camera_media_id" BIGINT,
    "camera_cam_type" TEXT,
    "camera_cam_positions" JSONB,
    "camera_uploaded_at" TEXT,
    "last_verified_at" TIMESTAMP(3),
    "data_version" INTEGER NOT NULL DEFAULT 1,
    "raw_response" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "motive_driver_performance_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "motive_driver_performance_events_clerk_org_id_idx" ON "motive_driver_performance_events"("clerk_org_id");

-- CreateIndex
CREATE INDEX "motive_driver_performance_events_driver_id_idx" ON "motive_driver_performance_events"("driver_id");

-- CreateIndex
CREATE INDEX "motive_driver_performance_events_vehicle_id_idx" ON "motive_driver_performance_events"("vehicle_id");

-- CreateIndex
CREATE INDEX "motive_driver_performance_events_event_type_idx" ON "motive_driver_performance_events"("event_type");

-- CreateIndex
CREATE INDEX "motive_driver_performance_events_date_idx" ON "motive_driver_performance_events"("date");

-- CreateIndex
CREATE INDEX "motive_driver_performance_events_clerk_org_id_date_idx" ON "motive_driver_performance_events"("clerk_org_id", "date");

-- CreateIndex
CREATE INDEX "motive_driver_performance_events_clerk_org_id_driver_id_dat_idx" ON "motive_driver_performance_events"("clerk_org_id", "driver_id", "date");

-- CreateIndex
CREATE INDEX "motive_driver_performance_events_last_verified_at_idx" ON "motive_driver_performance_events"("last_verified_at");

-- CreateIndex
CREATE UNIQUE INDEX "motive_driver_performance_events_clerk_org_id_motive_event__key" ON "motive_driver_performance_events"("clerk_org_id", "motive_event_id");
