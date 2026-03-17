-- Store all driver utilization rollups; driver may be unassigned (no data gap)
ALTER TABLE "motive_driver_utilization" ALTER COLUMN "driver_id" DROP NOT NULL;
