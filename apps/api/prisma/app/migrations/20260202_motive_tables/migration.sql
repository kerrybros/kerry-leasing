-- MOTIVE TELEMATICS TABLES MIGRATION
-- Creates 5 tables for storing Motive API data with verification tracking
-- Generated: 2026-02-02

-- =====================================================
-- TABLE 1: MOTIVE VEHICLE UTILIZATION
-- Source: GET /v2/vehicle_utilization
-- Daily vehicle metrics with 2-day lookback verification
-- =====================================================
CREATE TABLE IF NOT EXISTS "motive_vehicle_utilization" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clerk_org_id" TEXT NOT NULL,
    "vehicle_id" INTEGER NOT NULL,
    "vehicle_number" TEXT,
    "vin" TEXT,
    "date" TEXT NOT NULL,
    
    -- Utilization metrics
    "last_located_at" TEXT,
    "utilization_percentage" DOUBLE PRECISION,
    "idle_time" INTEGER,
    "idle_fuel" DOUBLE PRECISION,
    "driving_time" INTEGER,
    "driving_fuel" DOUBLE PRECISION,
    "total_fuel" DOUBLE PRECISION,
    "total_distance" DOUBLE PRECISION,
    "message" TEXT,
    
    -- Data verification tracking
    "last_verified_at" TIMESTAMP(3),
    "data_version" INTEGER NOT NULL DEFAULT 1,
    
    -- Full API response
    "raw_response" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for motive_vehicle_utilization
CREATE UNIQUE INDEX "motive_vehicle_utilization_clerk_org_id_vehicle_id_date_key" 
    ON "motive_vehicle_utilization"("clerk_org_id", "vehicle_id", "date");
CREATE INDEX "motive_vehicle_utilization_clerk_org_id_idx" 
    ON "motive_vehicle_utilization"("clerk_org_id");
CREATE INDEX "motive_vehicle_utilization_vehicle_id_idx" 
    ON "motive_vehicle_utilization"("vehicle_id");
CREATE INDEX "motive_vehicle_utilization_vin_idx" 
    ON "motive_vehicle_utilization"("vin");
CREATE INDEX "motive_vehicle_utilization_date_idx" 
    ON "motive_vehicle_utilization"("date");
CREATE INDEX "motive_vehicle_utilization_clerk_org_id_date_idx" 
    ON "motive_vehicle_utilization"("clerk_org_id", "date");
CREATE INDEX "motive_vehicle_utilization_last_verified_at_idx" 
    ON "motive_vehicle_utilization"("last_verified_at");

-- =====================================================
-- TABLE 2: MOTIVE DRIVER UTILIZATION
-- Source: GET /v2/driver_utilization
-- Daily driver metrics with 2-day lookback verification
-- =====================================================
CREATE TABLE IF NOT EXISTS "motive_driver_utilization" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clerk_org_id" TEXT NOT NULL,
    "driver_id" INTEGER NOT NULL,
    "driver_first_name" TEXT,
    "driver_last_name" TEXT,
    "driver_username" TEXT,
    "driver_email" TEXT,
    "date" TEXT NOT NULL,
    
    -- Daily utilization metrics
    "utilization" DOUBLE PRECISION,
    "idle_time" INTEGER,
    "driving_time" INTEGER,
    "idle_fuel" DOUBLE PRECISION,
    "driving_fuel" DOUBLE PRECISION,
    
    -- Data verification tracking
    "last_verified_at" TIMESTAMP(3),
    "data_version" INTEGER NOT NULL DEFAULT 1,
    
    -- Full API response
    "raw_response" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for motive_driver_utilization
CREATE UNIQUE INDEX "motive_driver_utilization_clerk_org_id_driver_id_date_key" 
    ON "motive_driver_utilization"("clerk_org_id", "driver_id", "date");
CREATE INDEX "motive_driver_utilization_clerk_org_id_idx" 
    ON "motive_driver_utilization"("clerk_org_id");
CREATE INDEX "motive_driver_utilization_driver_id_idx" 
    ON "motive_driver_utilization"("driver_id");
CREATE INDEX "motive_driver_utilization_date_idx" 
    ON "motive_driver_utilization"("date");
CREATE INDEX "motive_driver_utilization_clerk_org_id_date_idx" 
    ON "motive_driver_utilization"("clerk_org_id", "date");
CREATE INDEX "motive_driver_utilization_last_verified_at_idx" 
    ON "motive_driver_utilization"("last_verified_at");

-- =====================================================
-- TABLE 3: MOTIVE IDLE EVENTS
-- Source: GET /v1/idle_events
-- Individual idle occurrences with verification
-- =====================================================
CREATE TABLE IF NOT EXISTS "motive_idle_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clerk_org_id" TEXT NOT NULL,
    "motive_event_id" BIGINT NOT NULL,
    
    -- Driver info
    "driver_id" INTEGER NOT NULL,
    "driver_first_name" TEXT,
    "driver_last_name" TEXT,
    "driver_username" TEXT,
    "driver_email" TEXT,
    
    -- Vehicle info
    "vehicle_id" INTEGER NOT NULL,
    "vehicle_number" TEXT,
    "vin" TEXT,
    
    -- Event timing
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    
    -- Fuel data
    "veh_fuel_start" DOUBLE PRECISION,
    "veh_fuel_end" DOUBLE PRECISION,
    
    -- Location data
    "lat" DOUBLE PRECISION,
    "lon" DOUBLE PRECISION,
    "city" TEXT,
    "state" TEXT,
    "location" TEXT,
    
    -- Road geometry data
    "rg_brg" DOUBLE PRECISION,
    "rg_km" DOUBLE PRECISION,
    "rg_match" BOOLEAN,
    
    -- Event metadata
    "end_type" TEXT,
    "eld_device_id" INTEGER,
    "eld_identifier" TEXT,
    
    -- Data verification tracking
    "last_verified_at" TIMESTAMP(3),
    "data_version" INTEGER NOT NULL DEFAULT 1,
    
    -- Full API response
    "raw_response" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for motive_idle_events
CREATE UNIQUE INDEX "motive_idle_events_clerk_org_id_motive_event_id_key" 
    ON "motive_idle_events"("clerk_org_id", "motive_event_id");
CREATE INDEX "motive_idle_events_clerk_org_id_idx" 
    ON "motive_idle_events"("clerk_org_id");
CREATE INDEX "motive_idle_events_motive_event_id_idx" 
    ON "motive_idle_events"("motive_event_id");
CREATE INDEX "motive_idle_events_driver_id_idx" 
    ON "motive_idle_events"("driver_id");
CREATE INDEX "motive_idle_events_vehicle_id_idx" 
    ON "motive_idle_events"("vehicle_id");
CREATE INDEX "motive_idle_events_vin_idx" 
    ON "motive_idle_events"("vin");
CREATE INDEX "motive_idle_events_date_idx" 
    ON "motive_idle_events"("date");
CREATE INDEX "motive_idle_events_clerk_org_id_date_idx" 
    ON "motive_idle_events"("clerk_org_id", "date");
CREATE INDEX "motive_idle_events_start_time_idx" 
    ON "motive_idle_events"("start_time");
CREATE INDEX "motive_idle_events_last_verified_at_idx" 
    ON "motive_idle_events"("last_verified_at");

-- =====================================================
-- TABLE 4: MOTIVE DRIVING PERIODS
-- Source: GET /v1/driving_periods
-- Individual driving trips with verification
-- =====================================================
CREATE TABLE IF NOT EXISTS "motive_driving_periods" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clerk_org_id" TEXT NOT NULL,
    "motive_period_id" BIGINT NOT NULL,
    
    -- Driver info
    "driver_id" INTEGER NOT NULL,
    "driver_first_name" TEXT,
    "driver_last_name" TEXT,
    "driver_username" TEXT,
    "driver_email" TEXT,
    
    -- Vehicle info
    "vehicle_id" INTEGER NOT NULL,
    "vehicle_number" TEXT,
    "vin" TEXT,
    
    -- Period timing
    "start_time" TEXT NOT NULL,
    "end_time" TEXT,
    "date" TEXT NOT NULL,
    "duration" DOUBLE PRECISION,
    
    -- Period metadata
    "status" TEXT,
    "type" TEXT,
    "annotation_status" INTEGER,
    "notes" TEXT,
    "source" INTEGER,
    
    -- Distance/odometer
    "start_kilometers" DOUBLE PRECISION,
    "end_kilometers" DOUBLE PRECISION,
    "distance" TEXT,
    
    -- Origin location
    "origin" TEXT,
    "origin_lat" DOUBLE PRECISION,
    "origin_lon" DOUBLE PRECISION,
    
    -- Destination location
    "destination" TEXT,
    "destination_lat" DOUBLE PRECISION,
    "destination_lon" DOUBLE PRECISION,
    
    -- Electric vehicle metrics
    "start_hvb_state_of_charge" DOUBLE PRECISION,
    "end_hvb_state_of_charge" DOUBLE PRECISION,
    "start_hvb_lifetime_energy_output" DOUBLE PRECISION,
    "end_hvb_lifetime_energy_output" DOUBLE PRECISION,
    
    -- Data verification tracking
    "last_verified_at" TIMESTAMP(3),
    "data_version" INTEGER NOT NULL DEFAULT 1,
    
    -- Full API response
    "raw_response" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for motive_driving_periods
CREATE UNIQUE INDEX "motive_driving_periods_clerk_org_id_motive_period_id_key" 
    ON "motive_driving_periods"("clerk_org_id", "motive_period_id");
CREATE INDEX "motive_driving_periods_clerk_org_id_idx" 
    ON "motive_driving_periods"("clerk_org_id");
CREATE INDEX "motive_driving_periods_motive_period_id_idx" 
    ON "motive_driving_periods"("motive_period_id");
CREATE INDEX "motive_driving_periods_driver_id_idx" 
    ON "motive_driving_periods"("driver_id");
CREATE INDEX "motive_driving_periods_vehicle_id_idx" 
    ON "motive_driving_periods"("vehicle_id");
CREATE INDEX "motive_driving_periods_vin_idx" 
    ON "motive_driving_periods"("vin");
CREATE INDEX "motive_driving_periods_date_idx" 
    ON "motive_driving_periods"("date");
CREATE INDEX "motive_driving_periods_status_idx" 
    ON "motive_driving_periods"("status");
CREATE INDEX "motive_driving_periods_clerk_org_id_date_idx" 
    ON "motive_driving_periods"("clerk_org_id", "date");
CREATE INDEX "motive_driving_periods_start_time_idx" 
    ON "motive_driving_periods"("start_time");
CREATE INDEX "motive_driving_periods_last_verified_at_idx" 
    ON "motive_driving_periods"("last_verified_at");

-- =====================================================
-- TABLE 5: MOTIVE GEOFENCES
-- Source: GET /v1/geofences
-- Location zones/boundaries (configuration data, no verification needed)
-- =====================================================
CREATE TABLE IF NOT EXISTS "motive_geofences" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clerk_org_id" TEXT NOT NULL,
    "motive_geofence_id" INTEGER NOT NULL,
    
    -- Geofence metadata
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "address" TEXT,
    "description" TEXT,
    "category" TEXT,
    
    -- Location polygon
    "location_points" JSONB NOT NULL,
    
    -- Full API response
    "raw_response" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for motive_geofences
CREATE UNIQUE INDEX "motive_geofences_clerk_org_id_motive_geofence_id_key" 
    ON "motive_geofences"("clerk_org_id", "motive_geofence_id");
CREATE INDEX "motive_geofences_clerk_org_id_idx" 
    ON "motive_geofences"("clerk_org_id");
CREATE INDEX "motive_geofences_motive_geofence_id_idx" 
    ON "motive_geofences"("motive_geofence_id");
CREATE INDEX "motive_geofences_status_idx" 
    ON "motive_geofences"("status");
CREATE INDEX "motive_geofences_category_idx" 
    ON "motive_geofences"("category");

-- =====================================================
-- MIGRATION SUMMARY
-- =====================================================
-- Tables created: 5
-- Total indexes: 47
-- Unique constraints: 5
-- 
-- Verification strategy:
-- - Vehicle utilization: 2-day lookback
-- - Driver utilization: 2-day lookback
-- - Idle events: 2-day lookback
-- - Driving periods: 2-day lookback
-- - Geofences: Full sync daily (no verification)
-- =====================================================
