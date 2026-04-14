/**
 * Test Motive Scorecard endpoint against a recent date.
 * Determines whether the ~50% failure rate seen during historical backfill
 * is historical-only or ongoing for current dates.
 *
 * Run from apps/api/:
 *   pnpm exec tsx src/scripts/phase0/test-motive-scorecard-recent.ts
 */

import { PrismaClient } from '../../generated/app-client/index.js';
import { readCredentials } from '../../lib/credentials.js';
import { MotiveClient } from '../../telematics/motive/client.js';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.APP_DATABASE_URL } },
});

// Test the last 7 days
const TEST_DAYS = 7;

function getDateString(daysAgo: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

async function main() {
  console.log('\n═══════════════════════════════════════════════');
  console.log('  MOTIVE SCORECARD — Recent Date Test');
  console.log('═══════════════════════════════════════════════\n');

  const account = await prisma.telematicsProviderAccount.findFirst({
    where: { provider: 'MOTIVE', status: 'ACTIVE' },
  });

  if (!account) {
    console.error('No active Motive account found.');
    process.exit(1);
  }

  console.log(`  Org: ${account.clerkOrgId}\n`);

  const apiKey = readCredentials(account.credentialsJson).apiKey as string;
  const client = new MotiveClient(apiKey);

  let passCount = 0;
  let failCount = 0;

  for (let i = 1; i <= TEST_DAYS; i++) {
    const date = getDateString(i);
    try {
      const response = await client.get('/v1/scorecard_summary', {
        start_date: date,
        end_date: date,
        per_page: 5,
      });
      const records = response?.vehicle_scorecard_summaries ?? response?.data ?? [];
      const count = Array.isArray(records) ? records.length : 0;
      console.log(`  ✓  ${date}  →  ${count} vehicle scorecard records`);
      passCount++;
    } catch (err: any) {
      console.log(`  ✗  ${date}  →  ERROR: ${err.message}`);
      failCount++;
    }
  }

  console.log('\n───────────────────────────────────────────────');
  console.log(`  Results: ${passCount} PASS / ${failCount} FAIL out of ${TEST_DAYS} days`);

  if (failCount === 0) {
    console.log('  VERDICT: Scorecard API is healthy for recent dates.');
    console.log('           Historical failures were likely data availability gaps in Motive.');
  } else if (failCount <= TEST_DAYS / 2) {
    console.log('  VERDICT: Sporadic failures — monitor after backfill.');
  } else {
    console.log('  VERDICT: Consistent failures — scorecard data will be sparse. See KNOWN_LIMITATIONS.md.');
  }
  console.log('═══════════════════════════════════════════════\n');
}

main()
  .catch((err) => {
    console.error('Fatal:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
