/**
 * One-off: run Whiparound sync for a Clerk org (loads credentials from App DB).
 *
 *   pnpm exec tsx src/scripts/run-whiparound-sync.ts [clerkOrgId] [--full]
 */
import { getAppPrisma } from '../lib/prisma.js';
import { syncWhiparoundOrg } from '../integrations/whiparound/syncService.js';

const WOLVERINE = 'org_39B7lu1b8YKds8IOtzrk6LpKnLW';

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== '--full');
  const full = process.argv.includes('--full');
  const clerkOrgId = args[0] ?? WOLVERINE;

  const prisma = getAppPrisma();
  const acct = await prisma.whiparoundAccount.findUnique({
    where: { clerkOrgId },
    select: { clerkOrgId: true, credentials: true },
  });
  if (!acct) {
    console.error(`No whiparound_accounts row for ${clerkOrgId}`);
    process.exit(1);
  }

  console.log(`Syncing Whiparound for ${clerkOrgId} (fullInspectionBackfill=${full})…`);
  const result = await syncWhiparoundOrg(clerkOrgId, acct.credentials, {
    forceFullInspectionBackfill: full,
  });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.success && result.errors === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
