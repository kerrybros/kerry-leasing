/**
 * RESET ORG TELEMATICS STATUS
 *
 * Resets a telematicsProviderAccount status back to ACTIVE and clears any
 * stored error message. Useful when an org is stuck in ERROR state due to a
 * transient API failure or manual investigation.
 *
 * Usage:
 *   pnpm exec tsx src/scripts/admin/reset-org-status.ts --org=org_xxxxx
 *   pnpm exec tsx src/scripts/admin/reset-org-status.ts --org=org_xxxxx --dry-run
 */

import 'dotenv/config';
import { appPrisma } from '../../lib/prisma.js';

async function main() {
  const args = process.argv.slice(2);
  const orgArg = args.find(a => a.startsWith('--org='));
  const dryRun = args.includes('--dry-run');

  if (!orgArg) {
    console.error('Usage: reset-org-status.ts --org=<clerkOrgId> [--dry-run]');
    process.exit(1);
  }

  const clerkOrgId = orgArg.split('=')[1];

  const account = await appPrisma.telematicsProviderAccount.findUnique({
    where: { clerkOrgId },
    select: { id: true, clerkOrgId: true, provider: true, status: true, lastError: true, lastSyncAt: true },
  });

  if (!account) {
    console.error(`No telematicsProviderAccount found for org: ${clerkOrgId}`);
    process.exit(1);
  }

  console.log('\nCurrent state:');
  console.log(`  Org:       ${account.clerkOrgId}`);
  console.log(`  Provider:  ${account.provider}`);
  console.log(`  Status:    ${account.status}`);
  console.log(`  LastError: ${account.lastError ?? '(none)'}`);
  console.log(`  LastSync:  ${account.lastSyncAt?.toISOString() ?? '(never)'}`);

  if (account.status === 'ACTIVE') {
    console.log('\nOrg is already ACTIVE. Nothing to do.');
    await appPrisma.$disconnect();
    return;
  }

  if (dryRun) {
    console.log('\n[DRY RUN] Would reset status to ACTIVE and clear lastError.');
    await appPrisma.$disconnect();
    return;
  }

  await appPrisma.telematicsProviderAccount.update({
    where: { id: account.id },
    data: { status: 'ACTIVE', lastError: null },
  });

  console.log('\nReset complete:');
  console.log(`  Status:    ERROR → ACTIVE`);
  console.log(`  LastError: cleared`);

  await appPrisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
