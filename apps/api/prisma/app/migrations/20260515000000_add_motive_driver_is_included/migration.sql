-- AlterTable
ALTER TABLE "motive_driver_master" ADD COLUMN "is_included" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "motive_driver_master_clerk_org_id_is_included_idx" ON "motive_driver_master"("clerk_org_id", "is_included");
