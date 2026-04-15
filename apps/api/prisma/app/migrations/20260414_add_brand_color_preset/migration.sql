-- CreateEnum
CREATE TYPE "BrandColorPreset" AS ENUM ('KERRY_GOLD', 'ROYAL_BLUE', 'NAVY', 'TEAL', 'FOREST', 'BURGUNDY', 'AMBER', 'VIOLET', 'SLATE_BRAND', 'COPPER');

-- AlterTable
ALTER TABLE "organization_settings" ADD COLUMN "brand_color_preset" "BrandColorPreset";
