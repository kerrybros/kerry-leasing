-- Store all idle events; driver may be unassigned (no data gap)
ALTER TABLE "motive_idle_events" ALTER COLUMN "driver_id" DROP NOT NULL;
