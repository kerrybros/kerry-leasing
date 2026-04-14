-- Add custom_unit_name: admin-set display name override for service plan units
ALTER TABLE "service_plan_units" ADD COLUMN "custom_unit_name" TEXT;

-- Add telematics_vehicle_id: fallback identifier for telematics vehicles that have no VIN
ALTER TABLE "service_plan_units" ADD COLUMN "telematics_vehicle_id" TEXT;
