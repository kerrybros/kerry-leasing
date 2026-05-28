-- Tier 2: bring Samsara to feature-parity with Motive on the IDLE map.
--   * samsara_addresses → geofence layer + inside/outside filter
--   * samsara_drivers   → resolve operator_id on idle events into a driver name

-- CreateTable
CREATE TABLE "samsara_addresses" (
    "id"                    TEXT             NOT NULL,
    "clerk_org_id"          TEXT             NOT NULL,
    "samsara_address_id"    TEXT             NOT NULL,
    "name"                  TEXT             NOT NULL,
    "formatted_address"     TEXT,
    "geofence_type"         TEXT             NOT NULL,
    "location_points"       JSONB            NOT NULL,
    "circle_lat"            DOUBLE PRECISION,
    "circle_lon"            DOUBLE PRECISION,
    "circle_radius_meters"  DOUBLE PRECISION,
    "latitude"              DOUBLE PRECISION,
    "longitude"             DOUBLE PRECISION,
    "raw_response"          JSONB            NOT NULL,
    "created_at"            TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"            TIMESTAMP(3)     NOT NULL,

    CONSTRAINT "samsara_addresses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "samsara_addresses_clerk_org_id_samsara_address_id_key"
    ON "samsara_addresses"("clerk_org_id", "samsara_address_id");
CREATE INDEX "samsara_addresses_clerk_org_id_idx" ON "samsara_addresses"("clerk_org_id");

-- CreateTable
CREATE TABLE "samsara_drivers" (
    "id"                        TEXT         NOT NULL,
    "clerk_org_id"              TEXT         NOT NULL,
    "samsara_driver_id"         TEXT         NOT NULL,
    "name"                      TEXT,
    "first_name"                TEXT,
    "last_name"                 TEXT,
    "username"                  TEXT,
    "email"                     TEXT,
    "phone"                     TEXT,
    "license_number"            TEXT,
    "external_ids"              JSONB,
    "driver_activation_status"  TEXT,
    "raw_response"              JSONB        NOT NULL,
    "created_at"                TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"                TIMESTAMP(3) NOT NULL,

    CONSTRAINT "samsara_drivers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "samsara_drivers_clerk_org_id_samsara_driver_id_key"
    ON "samsara_drivers"("clerk_org_id", "samsara_driver_id");
CREATE INDEX "samsara_drivers_clerk_org_id_idx" ON "samsara_drivers"("clerk_org_id");
