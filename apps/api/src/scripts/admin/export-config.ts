/**
 * EXPORT CONFIG SCRIPT
 *
 * Exports all non-telematics configuration tables to JSON files in
 * src/scripts/admin/config-export/ before a database reset.
 *
 * Run from apps/api/:
 *   pnpm exec tsx src/scripts/admin/export-config.ts
 *
 * Tables exported (7):
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
const OUTPUT_DIR = path.join(__dirname, 'config-export');

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.APP_DATABASE_URL } },
});

async function main() {
  console.log('\n═══════════════════════════════════════════════');
  console.log('  CONFIG EXPORT — Pre-Database-Reset Backup');
  console.log('═══════════════════════════════════════════════\n');

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const tables = [
    {
      name: 'organization_settings',
      fetch: () => prisma.organizationSettings.findMany(),
    },
    {
      name: 'telematics_provider_accounts',
      fetch: () => prisma.telematicsProviderAccount.findMany(),
    },
    {
      name: 'customer_org_maps',
      fetch: () => prisma.customerOrgMap.findMany(),
    },
    {
      name: 'repair_customer_configs',
      fetch: () => prisma.repairCustomerConfig.findMany(),
    },
    {
      name: 'service_plan_units',
      fetch: () => prisma.servicePlanUnit.findMany(),
    },
    {
      name: 'system_config',
      fetch: () => prisma.systemConfig.findMany(),
    },
    {
      name: 'telematics_vehicle_maps',
      fetch: () => prisma.telematicsVehicleMap.findMany(),
    },
  ];

  let allPassed = true;

  for (const table of tables) {
    try {
      const rows = await table.fetch();
      const filePath = path.join(OUTPUT_DIR, `${table.name}.json`);
      fs.writeFileSync(filePath, JSON.stringify(rows, null, 2));
      console.log(`  ✓  ${table.name.padEnd(35)} ${rows.length} rows  →  ${filePath}`);
    } catch (err: any) {
      console.error(`  ✗  ${table.name}: ${err.message}`);
      allPassed = false;
    }
  }

  console.log('\n───────────────────────────────────────────────');
  if (allPassed) {
    console.log('  EXPORT COMPLETE — safe to proceed with reset');
    console.log(`  Files written to: ${OUTPUT_DIR}`);
  } else {
    console.log('  EXPORT FAILED — do NOT proceed with reset until all tables export cleanly');
    process.exit(1);
  }
  console.log('═══════════════════════════════════════════════\n');
}

main()
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
