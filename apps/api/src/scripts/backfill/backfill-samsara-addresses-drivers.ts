/**
 * One-time backfill: pull addresses + drivers for all active Samsara orgs.
 * Runs once; the daily sync takes over after that.
 *
 * Usage: pnpm exec tsx src/scripts/backfill/backfill-samsara-addresses-drivers.ts
 */

import 'dotenv/config';
import { appPrisma } from '../../lib/prisma.js';
import { readCredentials } from '../../lib/credentials.js';
import { syncSamsaraAddresses } from '../../telematics/samsara/sync/syncSamsaraAddresses.js';
import { syncSamsaraDrivers } from '../../telematics/samsara/sync/syncSamsaraDrivers.js';

async function main() {
  const accounts = await appPrisma.telematicsProviderAccount.findMany({
    where: { provider: 'SAMSARA', status: 'ACTIVE' },
  });

  if (accounts.length === 0) {
    console.error('No active Samsara orgs found.');
    process.exit(1);
  }

  console.log(`Backfilling addresses + drivers for ${accounts.length} Samsara org(s)\n`);

  for (const account of accounts) {
    const apiToken = readCredentials(account.credentialsJson).apiToken as string;
    console.log(`\n=== Org: ${account.clerkOrgId} ===`);

    try {
      const addressesResult = await syncSamsaraAddresses(account.clerkOrgId, apiToken);
      console.log(
        `  Addresses: ${addressesResult.recordCount} fetched, ${addressesResult.newCount} new, ${addressesResult.updatedCount} updated, ${addressesResult.errorCount} errors`
      );
    } catch (err: any) {
      console.error(`  Addresses sync FAILED:`, err.message);
    }

    try {
      const driversResult = await syncSamsaraDrivers(account.clerkOrgId, apiToken);
      console.log(
        `  Drivers: ${driversResult.recordCount} fetched, ${driversResult.newCount} new, ${driversResult.updatedCount} updated, ${driversResult.errorCount} errors`
      );
    } catch (err: any) {
      console.error(`  Drivers sync FAILED:`, err.message);
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await appPrisma.$disconnect();
  });
