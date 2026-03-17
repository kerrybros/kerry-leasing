/**
 * Set a Motive provider account to ACTIVE so the daily cron syncs it.
 * Usage: pnpm exec tsx src/scripts/activate-motive-org.ts --org=org_XXXXX
 */
import 'dotenv/config';
import { getAppPrisma } from '../lib/prisma.js';

function parseArgs(): { org: string } {
  const args = process.argv.slice(2);
  for (const arg of args) {
    if (arg.startsWith('--org=')) return { org: arg.split('=')[1] };
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
  if (!account || account.provider !== 'MOTIVE') {
    console.error(`No Motive account for org: ${org}`);
    process.exit(1);
  }
  await app.telematicsProviderAccount.update({
    where: { clerkOrgId: org },
    data: { status: 'ACTIVE', lastError: null },
  });
  console.log(`\n✓ Motive account for ${org} set to ACTIVE.\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
