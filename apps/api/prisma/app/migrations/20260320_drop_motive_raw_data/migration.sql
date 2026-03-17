-- Drop motive_raw_data table: this table was never written to by any sync code.
-- All Motive data is stored in the properly scoped tables:
--   motive_vehicle_utilization, motive_driver_utilization,
--   motive_driving_periods, motive_idle_events, motive_geofences
DROP TABLE IF EXISTS motive_raw_data;
