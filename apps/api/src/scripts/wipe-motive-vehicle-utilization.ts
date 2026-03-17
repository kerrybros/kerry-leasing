/**
 * WIPE MOTIVE VEHICLE UTILIZATION
 *
 * Deletes all rows from motive_vehicle_utilization so you can rebuild from the
 * v1 vehicle utilization API. Use after switching from v2 to v1, or to force a
 * full re-sync.
 *
 * Optional: --org=org_xxxxx to wipe only one org. Without --org, wipes all orgs.
 *
 * After running:
 * - Re-sync via daily cron (yesterday + 2-day verification), or
 * - Backdate: pnpm exec tsx src/scripts/backdate-motive-by-month.ts -- --org=org_xxxxx
 * - API caches telematics for ~10h; clear cache or restart API to see fresh data in UI.
 *
 * Usage:
 *   pnpm exec tsx src/scripts/wipe-motive-vehicle-utilization.ts
 *   pnpm exec tsx src/scripts/wipe-motive-vehicle-utilization.ts --org=org_39B7lu1b8YKds8IOtzrk6LpKnLW
 */

import 'dotenv/config';
import { appPrisma } from '../lib/prisma.js';

function parseArgs(): { org?: string } {
  const args = process.argv.slice(2);
  for (const arg of args) {
    if (arg.startsWith('--org=')) {
      return { org: arg.split('=')[1] };
    }
  }
  return {};
}

async function main() {
  const { org } = parseArgs();

  const where = org ? { clerkOrgId: org } : {};

  console.log('\n🗑️  Wiping Motive vehicle utilization');
  if (org) {
    console.log(`   Org: ${org}\n`);
  } else {
    console.log('   All orgs\n');
  }

  const result = await appPrisma.motiveVehicleUtilization.deleteMany({ where });
  console.log(`   motive_vehicle_utilization: ${result.count} row(s) deleted\n`);
  console.log('✅ Done. Run sync or backdate to rebuild from v1 API.\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
