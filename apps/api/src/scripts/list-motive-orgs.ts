/**
 * List all Motive provider accounts (active and inactive).
 * Use to see which orgs the cron will sync and to find extra orgs to disable.
 *
 * Usage:
 *   pnpm exec tsx src/scripts/list-motive-orgs.ts
 *
 * To keep only one org active, run deactivate-motive-org for the others (see below).
 */

import 'dotenv/config';
import { getAppPrisma } from '../lib/prisma.js';

async function main() {
  const app = getAppPrisma();

  const accounts = await app.telematicsProviderAccount.findMany({
    where: { provider: 'MOTIVE' },
    select: {
      id: true,
      clerkOrgId: true,
      status: true,
      lastSyncAt: true,
      lastError: true,
      createdAt: true,
    },
    orderBy: { clerkOrgId: 'asc' },
  });

  const active = accounts.filter((a) => a.status === 'ACTIVE');
  console.log('\n--- Motive provider accounts ---\n');
  console.log(`Total: ${accounts.length}  |  ACTIVE: ${active.length} (these are synced by cron)\n`);

  if (accounts.length === 0) {
    console.log('No Motive accounts found.\n');
    return;
  }

  for (const a of accounts) {
    console.log(`  ${a.clerkOrgId}`);
    console.log(`    status: ${a.status}`);
    console.log(`    lastSyncAt: ${a.lastSyncAt?.toISOString() ?? '—'}`);
    if (a.lastError) console.log(`    lastError: ${a.lastError}`);
    console.log('');
  }

  if (active.length > 1) {
    console.log('To keep only one org active, run for each org you want to disable:');
    console.log('  pnpm exec tsx src/scripts/deactivate-motive-org.ts --org=org_XXXXX\n');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
