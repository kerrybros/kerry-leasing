/**
 * BACKFILL SAMSARA: FEBRUARY 1 THROUGH YESTERDAY
 *
 * Pulls fuel-energy + idling events for every day from Feb 1 through yesterday
 * for all active Samsara orgs. Use once to backfill; then rely on cron for daily pulls.
 *
 * Usage:
 *   pnpm tsx src/scripts/backdate-samsara-feb.ts
 *   pnpm tsx src/scripts/backdate-samsara-feb.ts --start=2026-02-01 --end=2026-02-11
 *
 * Default: start = 2026-02-01, end = yesterday
 */

import 'dotenv/config';
import { appPrisma } from '../lib/prisma.js';
import { getYesterday } from '../telematics/dates.js';
import { backdateSamsaraData } from '../telematics/samsara/backdate.js';

const DEFAULT_START = '2026-02-01';

function parseArgs(): { startDate: string; endDate: string } {
  const args = process.argv.slice(2);
  let startDate = DEFAULT_START;
  let endDate = getYesterday();
  for (const arg of args) {
    if (arg.startsWith('--start=')) startDate = arg.split('=')[1];
    else if (arg.startsWith('--end=')) endDate = arg.split('=')[1];
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    throw new Error('Dates must be YYYY-MM-DD');
  }
  if (startDate > endDate) {
    throw new Error('Start date must be on or before end date');
  }
  return { startDate, endDate };
}

async function main() {
  const { startDate, endDate } = parseArgs();

  const accounts = await appPrisma.telematicsProviderAccount.findMany({
    where: { provider: 'SAMSARA', status: 'ACTIVE' },
    select: { clerkOrgId: true },
  });

  if (accounts.length === 0) {
    console.log('No active Samsara orgs found. Exiting.');
    process.exit(0);
  }

  console.log(`\n📅 Samsara backfill: ${startDate} → ${endDate}`);
  console.log(`   Orgs: ${accounts.length}\n`);

  for (const { clerkOrgId } of accounts) {
    await backdateSamsaraData({ clerkOrgId, startDate, endDate });
  }

  console.log('\n✅ Backfill finished for all Samsara orgs.\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
