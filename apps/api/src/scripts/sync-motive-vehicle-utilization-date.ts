/**
 * Sync only Motive vehicle utilization for a single date.
 * Uses the v1 vehicle_utilization API.
 *
 * Usage:
 *   pnpm exec tsx src/scripts/sync-motive-vehicle-utilization-date.ts
 *   pnpm exec tsx src/scripts/sync-motive-vehicle-utilization-date.ts --date=2026-02-03
 *   pnpm exec tsx src/scripts/sync-motive-vehicle-utilization-date.ts --date=2026-02-03 --org=org_39B7lu1b8YKds8IOtzrk6LpKnLW
 *
 * --date=YYYY-MM-DD   Default: 2026-02-03
 * --org=org_xxxxx     If set, only this Motive org is synced; otherwise all active Motive orgs.
 */

import 'dotenv/config';
import { appPrisma } from '../lib/prisma.js';
import { syncVehicleUtilization } from '../telematics/motive/sync/syncVehicleUtilization.js';

const DEFAULT_DATE = '2026-02-03';

function parseArgs(): { date: string; org: string | null } {
  const args = process.argv.slice(2);
  let date = DEFAULT_DATE;
  let org: string | null = null;
  for (const arg of args) {
    if (arg.startsWith('--date=')) date = arg.split('=')[1];
    else if (arg.startsWith('--org=')) org = arg.split('=')[1];
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('Date must be YYYY-MM-DD');
  }
  return { date, org };
}

async function main() {
  const { date, org } = parseArgs();

  const where = {
    provider: 'MOTIVE' as const,
    status: 'ACTIVE' as const,
    ...(org ? { clerkOrgId: org } : {}),
  };

  const accounts = await appPrisma.telematicsProviderAccount.findMany({ where });
  if (accounts.length === 0) {
    console.error('No active Motive provider account found' + (org ? ` for org ${org}` : '') + '.');
    process.exit(1);
  }

  console.log(`\nSyncing vehicle utilization only for ${date}`);
  if (org) console.log(`  Org: ${org}`);
  console.log(`  Orgs: ${accounts.length}\n`);

  for (const account of accounts) {
    const apiKey = (account.credentialsJson as { apiKey?: string })?.apiKey;
    if (!apiKey) {
      console.error(`  Skipping ${account.clerkOrgId}: no API key`);
      continue;
    }
    const result = await syncVehicleUtilization(account.clerkOrgId, apiKey, date, false);
    console.log(`  ${account.clerkOrgId}: ${result.recordCount} records, ${result.newCount} new, ${result.updatedCount} updated, ${result.unchangedCount} unchanged, ${result.errorCount} errors`);
  }

  console.log('\nDone.\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
