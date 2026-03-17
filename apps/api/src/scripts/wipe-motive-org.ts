/**
 * WIPE MOTIVE DATA FOR ONE ORG
 *
 * TELEMATICS ONLY — uses app DB only. Does not read or write repair data.
 * Deletes all Motive-sourced data for the given clerkOrgId so you can re-sync
 * from scratch (e.g. after fixing skip logic). Does NOT touch telematics_provider_accounts.
 *
 * After running: the API caches telematics responses for ~10 hours. To see empty data
 * in the UI immediately, either restart the API or call POST /telematics/admin/telematics/clear-cache
 * (internal role).
 *
 * Usage:
 *   pnpm wipe-motive-org -- --org=org_39B7lu1b8YKds8IOtzrk6LpKnLW
 */

import 'dotenv/config';
import { appPrisma } from '../lib/prisma.js'; // app DB only — no repair DB

function parseArgs(): { org: string } {
  const args = process.argv.slice(2);
  for (const arg of args) {
    if (arg.startsWith('--org=')) {
      return { org: arg.split('=')[1] };
    }
  }
  throw new Error('Required: --org=org_xxxxx');
}

async function main() {
  const { org } = parseArgs();

  console.log(`\n🗑️  Wiping Motive data for org: ${org}\n`);

  const where = { clerkOrgId: org };

  const r1 = await appPrisma.motiveIdleEvent.deleteMany({ where });
  console.log(`   motive_idle_events: ${r1.count} deleted`);

  const r2 = await appPrisma.motiveDrivingPeriod.deleteMany({ where });
  console.log(`   motive_driving_periods: ${r2.count} deleted`);

  const r3 = await appPrisma.motiveVehicleUtilization.deleteMany({ where });
  console.log(`   motive_vehicle_utilization: ${r3.count} deleted`);

  const r4 = await appPrisma.motiveDriverUtilization.deleteMany({ where });
  console.log(`   motive_driver_utilization: ${r4.count} deleted`);

  const r5 = await appPrisma.motiveGeofence.deleteMany({ where });
  console.log(`   motive_geofences: ${r5.count} deleted`);

  const total = r1.count + r2.count + r3.count + r4.count + r5.count;
  console.log(`\n✅ Done. ${total} rows removed for ${org}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
