/**
 * Keep only one Motive org active; set all other Motive orgs to DISABLED.
 * Cron will then sync only the specified org.
 *
 * Usage:
 *   pnpm exec tsx src/scripts/motive-keep-only-org.ts --org=org_39B7lu1b8YKds8IOtzrk6LpKnLW
 */

import 'dotenv/config';
import { getAppPrisma } from '../lib/prisma.js';

const KEEP_ORG = 'org_39B7lu1b8YKds8IOtzrk6LpKnLW';

function parseArgs(): { org: string } {
  const args = process.argv.slice(2);
  for (const arg of args) {
    if (arg.startsWith('--org=')) {
      return { org: arg.split('=')[1] };
    }
  }
  return { org: KEEP_ORG };
}

async function main() {
  const { org: keepOrg } = parseArgs();
  const app = getAppPrisma();

  const allMotive = await app.telematicsProviderAccount.findMany({
    where: { provider: 'MOTIVE' },
    select: { clerkOrgId: true, status: true },
  });

  const toDisable = allMotive.filter(
    (a) => a.clerkOrgId !== keepOrg && a.status === 'ACTIVE'
  );

  if (toDisable.length === 0) {
    console.log(`\n✓ Only ${keepOrg} is active (or already correct). No changes made.\n`);
    return;
  }

  for (const a of toDisable) {
    await app.telematicsProviderAccount.update({
      where: { clerkOrgId: a.clerkOrgId },
      data: { status: 'DISABLED' },
    });
    console.log(`  Disabled: ${a.clerkOrgId}`);
  }

  console.log(`\n✓ Kept ${keepOrg} active; disabled ${toDisable.length} other Motive org(s). Cron will sync only ${keepOrg}.\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
