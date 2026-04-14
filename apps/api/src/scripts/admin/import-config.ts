/**
 * IMPORT CONFIG SCRIPT
 *
 * Restores all non-telematics configuration tables from JSON files written by
 * export-config.ts, after a database reset.
 *
 * Run from apps/api/:
 *   pnpm exec tsx src/scripts/admin/import-config.ts
 *
 * Insertion order (respects foreign key dependencies):
 *   1. organization_settings
 *   2. telematics_provider_accounts
 *   3. customer_org_maps
 *   4. repair_customer_configs
 *   5. service_plan_units
 *   6. system_config
 *   7. telematics_vehicle_maps
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '../../generated/app-client/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INPUT_DIR = path.join(__dirname, 'config-export');

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.APP_DATABASE_URL } },
});

function readExport<T>(tableName: string): T[] {
  const filePath = path.join(INPUT_DIR, `${tableName}.json`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Export file not found: ${filePath} — run export-config.ts first`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T[];
}

async function main() {
  console.log('\n═══════════════════════════════════════════════');
  console.log('  CONFIG IMPORT — Post-Database-Reset Restore');
  console.log('═══════════════════════════════════════════════\n');

  // 1. organization_settings
  {
    const rows = readExport<any>('organization_settings');
    for (const row of rows) {
      await prisma.organizationSettings.upsert({
        where: { clerkOrgId: row.clerkOrgId },
        create: row,
        update: row,
      });
    }
    console.log(`  ✓  organization_settings       ${rows.length} rows restored`);
  }

  // 2. telematics_provider_accounts
  {
    const rows = readExport<any>('telematics_provider_accounts');
    for (const row of rows) {
      await prisma.telematicsProviderAccount.upsert({
        where: { clerkOrgId: row.clerkOrgId },
        create: row,
        update: row,
      });
    }
    console.log(`  ✓  telematics_provider_accounts ${rows.length} rows restored`);
  }

  // 3. customer_org_maps
  {
    const rows = readExport<any>('customer_org_maps');
    for (const row of rows) {
      await prisma.customerOrgMap.upsert({
        where: { clerkOrgId: row.clerkOrgId },
        create: row,
        update: row,
      });
    }
    console.log(`  ✓  customer_org_maps            ${rows.length} rows restored`);
  }

  // 4. repair_customer_configs
  {
    const rows = readExport<any>('repair_customer_configs');
    for (const row of rows) {
      await prisma.repairCustomerConfig.upsert({
        where: { klOrgId: row.klOrgId },
        create: row,
        update: row,
      });
    }
    console.log(`  ✓  repair_customer_configs      ${rows.length} rows restored`);
  }

  // 5. service_plan_units
  {
    const rows = readExport<any>('service_plan_units');
    for (const row of rows) {
      await prisma.servicePlanUnit.upsert({
        where: { clerkOrgId_repairUnitId: { clerkOrgId: row.clerkOrgId, repairUnitId: row.repairUnitId } },
        create: row,
        update: row,
      });
    }
    console.log(`  ✓  service_plan_units           ${rows.length} rows restored`);
  }

  // 6. system_config
  {
    const rows = readExport<any>('system_config');
    for (const row of rows) {
      await prisma.systemConfig.upsert({
        where: { key: row.key },
        create: row,
        update: row,
      });
    }
    console.log(`  ✓  system_config                ${rows.length} rows restored`);
  }

  // 7. telematics_vehicle_maps
  {
    const rows = readExport<any>('telematics_vehicle_maps');
    for (const row of rows) {
      await prisma.telematicsVehicleMap.upsert({
        where: {
          clerkOrgId_provider_providerVehicleId: {
            clerkOrgId: row.clerkOrgId,
            provider: row.provider,
            providerVehicleId: row.providerVehicleId,
          },
        },
        create: row,
        update: row,
      });
    }
    console.log(`  ✓  telematics_vehicle_maps      ${rows.length} rows restored`);
  }

  console.log('\n───────────────────────────────────────────────');
  console.log('  IMPORT COMPLETE — all config restored');
  console.log('═══════════════════════════════════════════════\n');
}

main()
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
