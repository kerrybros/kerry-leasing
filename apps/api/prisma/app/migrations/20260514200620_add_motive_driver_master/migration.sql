-- CreateTable
CREATE TABLE "motive_driver_master" (
    "id" TEXT NOT NULL,
    "clerk_org_id" TEXT NOT NULL,
    "motive_driver_id" INTEGER NOT NULL,
    "first_name" TEXT,
    "last_name" TEXT,
    "username" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "role" TEXT,
    "status" TEXT,
    "raw_response" JSONB NOT NULL,
    "last_synced_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "motive_driver_master_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "motive_driver_master_clerk_org_id_idx" ON "motive_driver_master"("clerk_org_id");

-- CreateIndex
CREATE INDEX "motive_driver_master_clerk_org_id_email_idx" ON "motive_driver_master"("clerk_org_id", "email");

-- CreateIndex
CREATE INDEX "motive_driver_master_clerk_org_id_status_idx" ON "motive_driver_master"("clerk_org_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "motive_driver_master_clerk_org_id_motive_driver_id_key" ON "motive_driver_master"("clerk_org_id", "motive_driver_id");
