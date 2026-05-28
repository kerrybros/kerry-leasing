/**
 * Run syncSamsaraOrgForDate for a specific org + list of dates.
 * Useful for filling backdate gaps.
 *
 * Usage: pnpm exec tsx src/scripts/sync-samsara-specific-dates.ts <orgId> <date1> [date2] ...
 */
import 'dotenv/config';
import { appPrisma } from '../lib/prisma.js';
import { readCredentials } from '../lib/credentials.js';
import { syncSamsaraOrgForDate } from '../telematics/samsara/syncService.js';

const orgId = process.argv[2];
const dates = process.argv.slice(3);
if (!orgId || dates.length === 0) {
  console.error('Usage: sync-samsara-specific-dates.ts <orgId> <date1> [date2] ...');
  process.exit(1);
}

async function main() {
  const account = await appPrisma.telematicsProviderAccount.findUnique({ where: { clerkOrgId: orgId! } });
  if (!account || account.provider !== 'SAMSARA') {
    console.error(`No Samsara account for ${orgId}`); process.exit(1);
  }
  const token = readCredentials(account.credentialsJson).apiToken as string;
  for (const date of dates) {
    console.log(`\n=== ${orgId} @ ${date} ===`);
    const r = await syncSamsaraOrgForDate(orgId!, token, date, false);
    console.log(`  success=${r.success}, steps=${r.results.length}, ${Math.round(r.duration/1000)}s`);
    if (!r.success) console.log(`  errors: ${r.error}`);
  }
}

main().catch(err => { console.error(err); process.exit(1); }).finally(() => appPrisma.$disconnect());
