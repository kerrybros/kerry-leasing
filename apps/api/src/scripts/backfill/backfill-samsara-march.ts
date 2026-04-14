/**
 * Samsara March 2026 backfill.
 * Loops March 1–31, 2026 and calls syncSamsaraOrgForDate for each day.
 *
 * Run AFTER the database has been wiped and confirmed clean.
 *
 * Usage: pnpm exec tsx src/scripts/backfill/backfill-samsara-march.ts
 *
 * Env:
 *   ORG_ID (optional) — restrict to a single org; defaults to all active Samsara orgs
 */

import 'dotenv/config';
import { appPrisma } from '../../lib/prisma.js';
import { readCredentials } from '../../lib/credentials.js';
import { syncSamsaraOrgForDate } from '../../telematics/samsara/syncService.js';
import { getDateRange } from '../../telematics/dates.js';

const START_DATE = '2026-03-01';
const END_DATE = '2026-03-31';
const DELAY_MS = 1500; // rate-limit courtesy delay between days

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const orgId = process.env.ORG_ID;

  const accounts = await appPrisma.telematicsProviderAccount.findMany({
    where: {
      provider: 'SAMSARA',
      ...(orgId ? { clerkOrgId: orgId } : { status: 'ACTIVE' }),
    },
  });

  if (accounts.length === 0) {
    console.error('No Samsara accounts found. Check ORG_ID or ensure status=ACTIVE.');
    process.exit(1);
  }

  const dates = getDateRange(START_DATE, END_DATE);
  console.log(`\nSamsara March backfill: ${dates.length} days × ${accounts.length} org(s)\n`);

  for (const account of accounts) {
    const creds = readCredentials(account.credentialsJson);
    const apiToken = creds.apiToken as string;

    console.log(`\n=== Org: ${account.clerkOrgId} ===`);

    for (const date of dates) {
      try {
        const result = await syncSamsaraOrgForDate(account.clerkOrgId, apiToken, date, false);
        const fuel = result.results.find((r) => r.endpoint === 'fuel_energy');
        console.log(
          `  ${date}: ${fuel?.newCount ?? 0} new, ${fuel?.updatedCount ?? 0} updated, ` +
          `${fuel?.errorCount ?? 0} errors`
        );
      } catch (err: any) {
        console.error(`  ${date}: ERROR — ${err.message}`);
      }
      await sleep(DELAY_MS);
    }
  }

  console.log('\nSamsara March backfill complete.\n');
}

main().catch((e) => { console.error(e); process.exit(1); });
