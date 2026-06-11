/**
 * Backfill safety events historically for a Samsara org.
 *
 * Previously a no-op due to a behaviorLabels parsing bug — so even orgs whose
 * backdate report says "complete" have zero safety events in DB. This script
 * fixes that retroactively by re-syncing day-by-day.
 *
 * Usage:
 *   pnpm exec tsx src/scripts/backfill/backfill-samsara-safety-events.ts
 *
 * Env:
 *   ORG_ID                  required — restrict to a single org
 *   START_DATE  YYYY-MM-DD  (default 2024-01-01)
 *   END_DATE    YYYY-MM-DD  (default yesterday)
 */
import 'dotenv/config';
import { appPrisma } from '../../lib/prisma.js';
import { readCredentials } from '../../lib/credentials.js';
import { syncSamsaraSafetyEvents } from '../../telematics/samsara/sync/syncSamsaraSafetyEvents.js';
import { getDateRange, getYesterday } from '../../telematics/dates.js';

async function main() {
  const orgId = process.env.ORG_ID;
  if (!orgId) { console.error('ORG_ID is required'); process.exit(1); }
  const startDate = process.env.START_DATE || '2024-01-01';
  const endDate = process.env.END_DATE || getYesterday();

  const account = await appPrisma.telematicsProviderAccount.findUnique({
    where: { clerkOrgId: orgId },
  });
  if (!account || account.provider !== 'SAMSARA') {
    console.error(`No Samsara account for ${orgId}`);
    process.exit(1);
  }
  const apiToken = readCredentials(account.credentialsJson).apiToken as string;

  const dates = getDateRange(startDate, endDate);
  console.log(`\nSafety events backfill for ${orgId}: ${dates.length} days (${startDate} → ${endDate})\n`);

  let totalEvents = 0;
  let totalErrors = 0;
  let daysWithEvents = 0;

  for (let i = 0; i < dates.length; i++) {
    const date = dates[i]!;
    try {
      const r = await syncSamsaraSafetyEvents(orgId, apiToken, date);
      totalEvents += r.newCount;
      totalErrors += r.errorCount;
      if (r.newCount > 0) daysWithEvents++;
      // Progress every 30 days
      if ((i + 1) % 30 === 0) {
        console.log(`  [${i + 1}/${dates.length}] ${date} — running total: ${totalEvents} events`);
      }
    } catch (err: any) {
      totalErrors++;
      console.error(`  ${date} FAILED: ${err.message}`);
      if (err?.name === 'TelematicsAuthError') {
        console.error(`  Stopping — auth error won't resolve.`);
        break;
      }
    }
    // Rate limit courtesy: 5 req/sec → 250ms sleep keeps us well under.
    await new Promise(r => setTimeout(r, 250));
  }

  console.log(`\n=== Done ===`);
  console.log(`Total events captured: ${totalEvents}`);
  console.log(`Days with events:      ${daysWithEvents} / ${dates.length}`);
  console.log(`Errors:                ${totalErrors}`);
}

main()
  .catch(err => { console.error(err); process.exit(1); })
  .finally(async () => { await appPrisma.$disconnect(); });
