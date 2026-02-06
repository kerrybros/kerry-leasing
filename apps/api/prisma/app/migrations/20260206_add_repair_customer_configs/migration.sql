-- CreateTable
CREATE TABLE "repair_customer_configs" (
    "id" TEXT NOT NULL,
    "kl_org_id" TEXT NOT NULL,
    "customer_name" TEXT NOT NULL,
    "contract_start_date" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "repair_customer_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "repair_customer_configs_kl_org_id_key" ON "repair_customer_configs"("kl_org_id");

-- CreateIndex
CREATE INDEX "repair_customer_configs_kl_org_id_idx" ON "repair_customer_configs"("kl_org_id");

