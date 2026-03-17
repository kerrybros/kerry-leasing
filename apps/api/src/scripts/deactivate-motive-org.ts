/**
 * Set a Motive provider account to DISABLED so the daily cron skips it.
 * Does not delete the account or any telematics data.
 *
 * Usage:
 *   pnpm exec tsx src/scripts/deactivate-motive-org.ts --org=org_XXXXX
 */

import 'dotenv/config';
import { getAppPrisma } from '../lib/prisma.js';

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
  const app = getAppPrisma();

  const account = await app.telematicsProviderAccount.findUnique({
    where: { clerkOrgId: org },
    select: { provider: true, status: true },
  });

  if (!account) {
    console.error(`No provider account found for org: ${org}`);
    process.exit(1);
  }
  if (account.provider !== 'MOTIVE') {
    console.error(`Org ${org} is not a Motive account (provider: ${account.provider})`);
    process.exit(1);
  }
  if (account.status === 'DISABLED') {
    console.log(`Org ${org} is already DISABLED.`);
    return;
  }

  await app.telematicsProviderAccount.update({
    where: { clerkOrgId: org },
    data: { status: 'DISABLED' },
  });

  console.log(`\n✓ Motive account for ${org} set to DISABLED. Cron will skip this org.\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
