/**
 * Backfill: pull driver fuel-energy + driver safety scores for active Samsara
 * orgs across a date range. One-time bootstrap; the daily sync takes over after.
 *
 * Usage:
 *   pnpm exec tsx src/scripts/backfill/backfill-samsara-driver-scorecard.ts
 *
 * Env:
 *   START_DATE  YYYY-MM-DD  (default: 90 days ago)
 *   END_DATE    YYYY-MM-DD  (default: yesterday)
 *   ORG_ID                  (optional — restrict to one org)
 */

import 'dotenv/config';
import { appPrisma } from '../../lib/prisma.js';
import { readCredentials } from '../../lib/credentials.js';
import { syncSamsaraDriverFuelEnergy } from '../../telematics/samsara/sync/syncSamsaraDriverFuelEnergy.js';
import { syncSamsaraDriverSafetyScores } from '../../telematics/samsara/sync/syncSamsaraDriverSafetyScores.js';
import { getDateRange, getYesterday } from '../../telematics/dates.js';

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0]!;
}

async function sleep(ms: number) {
  return new Promise<void>(r => setTimeout(r, ms));
}

async function main() {
  const startDate = process.env.START_DATE || daysAgo(90);
  const endDate = process.env.END_DATE || getYesterday();
  const orgFilter = process.env.ORG_ID;

  const accounts = await appPrisma.telematicsProviderAccount.findMany({
    where: {
      provider: 'SAMSARA',
      ...(orgFilter ? { clerkOrgId: orgFilter } : { status: 'ACTIVE' }),
    },
  });

  if (accounts.length === 0) {
    console.error('No matching Samsara orgs found.');
    process.exit(1);
  }

  const dates = getDateRange(startDate, endDate);
  console.log(
    `\nBackfilling Samsara driver scorecard: ${dates.length} days × ${accounts.length} org(s) ` +
    `(${startDate} → ${endDate})\n`
  );

  for (const account of accounts) {
    const apiToken = readCredentials(account.credentialsJson).apiToken as string;
    console.log(`\n=== Org: ${account.clerkOrgId} ===`);

    let fuelTotalNew = 0, fuelTotalUpdated = 0, fuelErrors = 0;
    let safetyTotalNew = 0, safetyTotalUpdated = 0, safetyErrors = 0;

    for (const date of dates) {
      try {
        const fuel = await syncSamsaraDriverFuelEnergy(account.clerkOrgId, apiToken, date);
        fuelTotalNew += fuel.newCount;
        fuelTotalUpdated += fuel.updatedCount;
        fuelErrors += fuel.errorCount;
      } catch (err: any) {
        fuelErrors++;
        console.error(`  ${date} fuel-energy FAILED:`, err.message);
        // 401 means the token lacks scope — no point retrying every day.
        if (err?.name === 'TelematicsAuthError') {
          console.error(`  Stopping fuel-energy backfill for this org (auth error).`);
          break;
        }
      }
      await sleep(250); // ~4/sec, well under 5/sec rate limit
    }

    for (const date of dates) {
      try {
        const safety = await syncSamsaraDriverSafetyScores(account.clerkOrgId, apiToken, date);
        safetyTotalNew += safety.newCount;
        safetyTotalUpdated += safety.updatedCount;
        safetyErrors += safety.errorCount;
      } catch (err: any) {
        safetyErrors++;
        console.error(`  ${date} safety-scores FAILED:`, err.message);
        if (err?.name === 'TelematicsAuthError') {
          console.error(`  Stopping safety-scores backfill for this org (auth error).`);
          break;
        }
      }
      await sleep(700); // safety-scores limit is 100/min = ~1.7/sec
    }

    console.log(
      `  Driver fuel-energy: ${fuelTotalNew} new, ${fuelTotalUpdated} updated, ${fuelErrors} errors`
    );
    console.log(
      `  Driver safety-scores: ${safetyTotalNew} new, ${safetyTotalUpdated} updated, ${safetyErrors} errors`
    );
  }
}

main()
  .catch(err => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await appPrisma.$disconnect();
  });
