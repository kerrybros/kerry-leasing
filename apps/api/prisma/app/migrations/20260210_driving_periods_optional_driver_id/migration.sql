-- Make driver_id nullable so we can store driving periods with no driver assigned
ALTER TABLE "motive_driving_periods" ALTER COLUMN "driver_id" DROP NOT NULL;
