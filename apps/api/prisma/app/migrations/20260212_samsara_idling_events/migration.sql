-- CreateTable: samsara_idling_events (one row per idling event; link to fuel-energy by asset_id = vehicle.id and date in API)
CREATE TABLE "samsara_idling_events" (
    "id" TEXT NOT NULL,
    "clerk_org_id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "start_time" TEXT NOT NULL,
    "duration_milliseconds" DOUBLE PRECISION,
    "fuel_consumed_milliliters" DOUBLE PRECISION,
    "event_date" TEXT NOT NULL,
    "raw_response" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "samsara_idling_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "samsara_idling_events_clerk_org_id_asset_id_start_time_key" ON "samsara_idling_events"("clerk_org_id", "asset_id", "start_time");
CREATE INDEX "samsara_idling_events_clerk_org_id_idx" ON "samsara_idling_events"("clerk_org_id");
CREATE INDEX "samsara_idling_events_clerk_org_id_event_date_idx" ON "samsara_idling_events"("clerk_org_id", "event_date");
CREATE INDEX "samsara_idling_events_asset_id_idx" ON "samsara_idling_events"("asset_id");
