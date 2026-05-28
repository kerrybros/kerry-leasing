/**
 * VERIFY: one full Samsara daily sync cycle for a given org + date.
 * Exercises the upsert refactor and the per-sync configLastSyncDate gate
 * end-to-end against the live API.
 *
 * Usage: pnpm exec tsx src/scripts/verify-samsara-daily-cycle.ts [orgId] [date]
 *   defaults: org_39RQY3qNO861ScQb0ZLFSUIFZkN, yesterday
 */

import 'dotenv/config';
import { appPrisma } from '../lib/prisma.js';
import { readCredentials } from '../lib/credentials.js';
import { syncSamsaraOrgForDate } from '../telematics/samsara/syncService.js';
import { getYesterday } from '../telematics/dates.js';

async function main() {
  const orgId = process.argv[2] || 'org_39RQY3qNO861ScQb0ZLFSUIFZkN';
  const date = process.argv[3] || getYesterday();

  const account = await appPrisma.telematicsProviderAccount.findUnique({
    where: { clerkOrgId: orgId },
  });
  if (!account || account.provider !== 'SAMSARA') {
    console.error(`No Samsara account for ${orgId}`);
    process.exit(1);
  }
  const apiToken = readCredentials(account.credentialsJson).apiToken as string;

  console.log(`\n=== Live daily-sync cycle: ${orgId} for ${date} ===\n`);

  // First pass — primary
  console.log('--- PRIMARY PASS ---');
  const primary = await syncSamsaraOrgForDate(orgId, apiToken, date, false);

  // Second pass — primary again, same date.
  // Should hit the configLastSyncDate gate and SKIP addresses/drivers.
  console.log('\n--- SECOND PRIMARY PASS (gate should skip addresses/drivers) ---');
  const secondary = await syncSamsaraOrgForDate(orgId, apiToken, date, false);

  console.log(`\n=== Summary ===`);
  console.log(`Primary  succeeded: ${primary.success}, ${primary.results.length} steps, ${Math.round(primary.duration/1000)}s`);
  console.log(`Secondary succeeded: ${secondary.success}, ${secondary.results.length} steps, ${Math.round(secondary.duration/1000)}s`);

  // Sanity: was addresses/drivers gated on the secondary run?
  const secondAddrStep = secondary.results.find(r => r.endpoint === 'addresses');
  const secondDrvStep = secondary.results.find(r => r.endpoint === 'drivers');
  const addrGated = !secondAddrStep; // step shouldn't even be pushed when gated
  const drvGated = !secondDrvStep;
  console.log(`Addresses gate on 2nd pass: ${addrGated ? '✓ skipped' : '✗ ran again'}`);
  console.log(`Drivers   gate on 2nd pass: ${drvGated ? '✓ skipped' : '✗ ran again'}`);

  if (!primary.success) {
    console.log(`\nPrimary errors:\n  ${primary.error}`);
  }
}

main()
  .catch(err => { console.error(err); process.exit(1); })
  .finally(async () => { await appPrisma.$disconnect(); });
