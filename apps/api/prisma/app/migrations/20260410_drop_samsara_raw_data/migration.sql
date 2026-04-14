-- Drop legacy samsara_raw_data table.
-- This table stored raw Samsara API responses in the old delta-pair format.
-- All data now flows to samsara_vehicle_utilization (normalized) and
-- samsara_idling_events (event-level). This table is no longer written to.
DROP TABLE IF EXISTS "samsara_raw_data";
