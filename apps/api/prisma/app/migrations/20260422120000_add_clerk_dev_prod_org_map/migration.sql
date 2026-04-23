-- CreateTable
CREATE TABLE "clerk_dev_prod_org_map" (
    "id" TEXT NOT NULL,
    "dev_org_id" TEXT NOT NULL,
    "prod_org_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "clerk_dev_prod_org_map_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clerk_dev_prod_org_map_dev_org_id_key" ON "clerk_dev_prod_org_map"("dev_org_id");

-- CreateIndex
CREATE INDEX "clerk_dev_prod_org_map_prod_org_id_idx" ON "clerk_dev_prod_org_map"("prod_org_id");

-- Dev → prod org ids (Kerry orgs, 2026)
INSERT INTO "clerk_dev_prod_org_map" ("id", "dev_org_id", "prod_org_id", "created_at", "updated_at")
VALUES
    ('b1sn9yzeym0jnzykrexyekkz', 'org_39B7lu1b8YKds8IOtzrk6LpKnLW', 'org_3CjgT71DAi9kYZt1vYIVh7DMirI', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('iidgc17b6dq0d4wxuhsxirnd', 'org_3CIuADO3uesH8uhCH7039dYfxYx', 'org_3CjgDyW69bZe3BrDMO1awLnRh5J', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('virdk5e23t9pqhaiwoy7zkl6', 'org_39RQY3qNO861ScQb0ZLFSUIFZkN', 'org_3CjgGmCTmjBkMqyIWmlXzIpTbup', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('pp8pfniwm7e6aydiur2cqcjr', 'org_3CJ8AAAXdYAeVMGJMaugtOszVa2', 'org_3CjgBGcEEDVN2BkC6YjUcKsw76W', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));
