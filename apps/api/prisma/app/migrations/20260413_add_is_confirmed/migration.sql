-- Add is_confirmed: marks a unit as intentionally having no telematics match (e.g. trailers)
ALTER TABLE "service_plan_units" ADD COLUMN "is_confirmed" BOOLEAN NOT NULL DEFAULT false;
