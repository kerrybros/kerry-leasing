-- AlterEnum
ALTER TYPE "DriverContactSource" ADD VALUE 'MOTIVE_AUTO';

-- AlterTable
ALTER TABLE "driver_contacts" ADD COLUMN     "email" TEXT;

-- CreateIndex
CREATE INDEX "driver_contacts_clerk_org_id_email_idx" ON "driver_contacts"("clerk_org_id", "email");
