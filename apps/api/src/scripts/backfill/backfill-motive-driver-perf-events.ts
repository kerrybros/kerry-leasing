/**
 * Backfill Motive driver performance events.
 * Loops a date range and calls syncDriverPerformanceEvents for each org × day.
 *
 * DO NOT RUN without reviewing START_DATE / END_DATE and confirming target orgs.
 * This hits GET /v2/driver_performance_events once per org per day — budget API rate accordingly.
 *
 * Usage:
 *   pnpm exec tsx src/scripts/backfill/backfill-motive-driver-perf-events.ts
 *
 * Env:
 *   ORG_ID       (optional) — restrict to a single org; defaults to all active Motive orgs
 *   START_DATE   (optional) — override START_DATE constant (YYYY-MM-DD)
 *   END_DATE     (optional) — override END_DATE constant (YYYY-MM-DD)
 */

import 'dotenv/config';
import { appPrisma } from '../../lib/prisma.js';
import { readCredentials } from '../../lib/credentials.js';
import { syncDriverPerformanceEvents } from '../../telematics/motive/sync/syncDriverPerformanceEvents.js';
import { getDateRange } from '../../telematics/dates.js';

const START_DATE = process.env.START_DATE ?? '2026-01-01';
const END_DATE   = process.env.END_DATE   ?? '2026-05-03'; // day before today; today's data syncs nightly

// Pause between API calls to avoid rate-limiting
const DELAY_MS = 1500;

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

async function main() {
  const orgId = process.env.ORG_ID;

  const accounts = await appPrisma.telematicsProviderAccount.findMany({
    where: {
      provider: 'MOTIVE',
      ...(orgId ? { clerkOrgId: orgId } : { status: 'ACTIVE' }),
    },
  });

  if (accounts.length === 0) {
    console.error('No Motive accounts found. Check ORG_ID or ensure status=ACTIVE.');
    process.exit(1);
  }

  const dates = getDateRange(START_DATE, END_DATE);
  console.log(
    `\nMotive driver perf events backfill: ${dates.length} days × ${accounts.length} org(s)\n` +
    `Range: ${START_DATE} → ${END_DATE}\n`
  );

  let totalNew = 0;
  let totalUpdated = 0;
  let totalErrors = 0;

  for (const account of accounts) {
    const creds = readCredentials(account.credentialsJson);
    const apiKey = creds.apiKey as string;

    console.log(`\n=== Org: ${account.clerkOrgId} ===`);

    for (const date of dates) {
      try {
        const result = await syncDriverPerformanceEvents(account.clerkOrgId, apiKey, date, false);

        totalNew     += result.newCount;
        totalUpdated += result.updatedCount;
        totalErrors  += result.errorCount;

        const line = `  ${date}: ${result.newCount} new, ${result.updatedCount} updated, ` +
          `${result.unchangedCount} unchanged, ${result.errorCount} errors`;

        if (result.errorCount > 0) {
          console.warn(line);
          for (const e of result.errors) {
            console.warn(`    ⚠ ${e.recordId}: ${e.error}`);
          }
        } else {
          console.log(line);
        }
      } catch (err: any) {
        totalErrors++;
        console.error(`  ${date}: FATAL — ${err.message}`);
      }

      await sleep(DELAY_MS);
    }
  }

  console.log(
    `\nBackfill complete.\n` +
    `  Total new:     ${totalNew}\n` +
    `  Total updated: ${totalUpdated}\n` +
    `  Total errors:  ${totalErrors}\n`
  );
}

main().catch((e) => { console.error(e); process.exit(1); });
