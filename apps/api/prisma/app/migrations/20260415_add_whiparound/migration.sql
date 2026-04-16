-- Migration: add_whiparound
-- Adds WhiparoundAccount, WhiparoundInspection, and WhiparoundDefect tables.

CREATE TYPE "WhiparoundAccountStatus" AS ENUM ('ACTIVE', 'INACTIVE');

CREATE TABLE "whiparound_accounts" (
    "id"           TEXT NOT NULL,
    "clerk_org_id" TEXT NOT NULL,
    "credentials"  JSONB NOT NULL,
    "status"       "WhiparoundAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_sync_at" TIMESTAMP(3),
    "last_error"   TEXT,
    "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whiparound_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "whiparound_accounts_clerk_org_id_key" ON "whiparound_accounts"("clerk_org_id");
CREATE INDEX "whiparound_accounts_clerk_org_id_idx"        ON "whiparound_accounts"("clerk_org_id");
CREATE INDEX "whiparound_accounts_status_idx"              ON "whiparound_accounts"("status");

CREATE TABLE "whiparound_inspections" (
    "id"                  TEXT NOT NULL,
    "clerk_org_id"        TEXT NOT NULL,
    "whiparound_id"       INTEGER NOT NULL,
    "driver_id"           INTEGER,
    "driver_name"         TEXT,
    "asset_id"            INTEGER,
    "team_id"             INTEGER,
    "form_id"             INTEGER,
    "completion"          TEXT,
    "passed"              BOOLEAN,
    "pdf_url"             TEXT,
    "duration_sec"        INTEGER,
    "inspected_at"        TIMESTAMP(3) NOT NULL,
    "ended_on_device_at"  TIMESTAMP(3),
    "raw_response"        JSONB,
    "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"          TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whiparound_inspections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "whiparound_inspections_clerk_org_id_whiparound_id_key"
    ON "whiparound_inspections"("clerk_org_id", "whiparound_id");
CREATE INDEX "whiparound_inspections_clerk_org_id_idx"
    ON "whiparound_inspections"("clerk_org_id");
CREATE INDEX "whiparound_inspections_clerk_org_id_inspected_at_idx"
    ON "whiparound_inspections"("clerk_org_id", "inspected_at" DESC);

CREATE TABLE "whiparound_defects" (
    "id"                TEXT NOT NULL,
    "clerk_org_id"      TEXT NOT NULL,
    "whiparound_id"     INTEGER NOT NULL,
    "defect_ref"        TEXT,
    "inspection_id"     INTEGER,
    "asset_id"          INTEGER,
    "asset_name"        TEXT,
    "team_id"           INTEGER,
    "team_name"         TEXT,
    "driver_name"       TEXT,
    "defect_name"       TEXT,
    "description"       TEXT,
    "status"            TEXT,
    "defect_priority"   TEXT,
    "defect_type"       TEXT,
    "severity"          TEXT,
    "repeated_times"    INTEGER,
    "assignee"          TEXT,
    "work_order"        TEXT,
    "defect_source"     TEXT,
    "created_by"        TEXT,
    "defect_created_at" TIMESTAMP(3),
    "defect_updated_at" TIMESTAMP(3),
    "raw_response"      JSONB,
    "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"        TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whiparound_defects_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "whiparound_defects_clerk_org_id_whiparound_id_key"
    ON "whiparound_defects"("clerk_org_id", "whiparound_id");
CREATE INDEX "whiparound_defects_clerk_org_id_idx"
    ON "whiparound_defects"("clerk_org_id");
CREATE INDEX "whiparound_defects_clerk_org_id_status_idx"
    ON "whiparound_defects"("clerk_org_id", "status");
CREATE INDEX "whiparound_defects_clerk_org_id_defect_created_at_idx"
    ON "whiparound_defects"("clerk_org_id", "defect_created_at" DESC);
