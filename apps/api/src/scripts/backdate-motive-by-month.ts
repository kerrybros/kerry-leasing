/**
 * RE-RUN ALL MOTIVE DATA BY MONTH
 *
 * TELEMATICS ONLY — uses app DB only. Does not read or write repair data.
 * Finds the earliest Motive data date in the DB, then runs the full Motive sync
 * month-by-month (first day through last day of each month) for all active Motive orgs.
 * Use after schema/logic changes to re-persist all data without skipping.
 *
 * Usage:
 *   pnpm backdate-motive-by-month
 *   pnpm backdate-motive-by-month -- --org=org_39B7lu1b8YKds8IOtzrk6LpKnLW
 *   pnpm backdate-motive-by-month -- --start=2025-01-01 --end=2026-02-12
 *
 * --org=clerkOrgId   If set, only this Motive org is backfilled.
 *                   Otherwise all ACTIVE Motive provider accounts are used.
 * If --start is omitted, uses the earliest date found in Motive tables (or 2025-01-01 if empty).
 * End defaults to yesterday.
 */

import 'dotenv/config';
import { appPrisma } from '../lib/prisma.js'; // app DB only — no repair DB
import { getYesterday } from '../telematics/dates.js';
import { backdateMotiveData } from '../telematics/motive/backdate.js';

const FALLBACK_START = '2025-01-01';

function parseArgs(): { startDate: string | null; endDate: string; orgSlug: string | null } {
  const args = process.argv.slice(2);
  let startDate: string | null = null;
  let endDate = getYesterday();
  let orgSlug: string | null = null;
  for (const arg of args) {
    if (arg.startsWith('--start=')) startDate = arg.split('=')[1];
    else if (arg.startsWith('--end=')) endDate = arg.split('=')[1];
    else if (arg.startsWith('--org=')) orgSlug = arg.split('=')[1];
  }
  if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    throw new Error('Start date must be YYYY-MM-DD');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    throw new Error('End date must be YYYY-MM-DD');
  }
  if (startDate && startDate > endDate) {
    throw new Error('Start date must be on or before end date');
  }
  return { startDate, endDate, orgSlug };
}

/** Get the earliest date string from any Motive table (YYYY-MM-DD). */
async function getEarliestMotiveDate(): Promise<string | null> {
  const queries = [
    appPrisma.motiveIdleEvent.findFirst({ orderBy: { date: 'asc' }, select: { date: true } }),
    appPrisma.motiveVehicleUtilization.findFirst({ orderBy: { date: 'asc' }, select: { date: true } }),
    appPrisma.motiveDriverUtilization.findFirst({ orderBy: { date: 'asc' }, select: { date: true } }),
    appPrisma.motiveDrivingPeriod.findFirst({ orderBy: { date: 'asc' }, select: { date: true } }),
  ];
  const results = await Promise.all(queries);
  const dates = results.map((r) => r?.date).filter(Boolean) as string[];
  if (dates.length === 0) return null;
  return dates.sort()[0];
}

/** Return [start, end] for each calendar month in [rangeStart, rangeEnd] (inclusive). */
function getMonthRanges(rangeStart: string, rangeEnd: string): Array<{ start: string; end: string; label: string }> {
  const ranges: Array<{ start: string; end: string; label: string }> = [];
  const [sy, sm] = rangeStart.split('-').map(Number);
  const [ey, em] = rangeEnd.split('-').map(Number);

  let y = sy;
  let m = sm;
  while (y < ey || (y === ey && m <= em)) {
    const monthStart = `${y}-${String(m).padStart(2, '0')}-01`;
    const lastDay = new Date(y, m, 0).getDate(); // next month 0 = last day of m
    const monthEnd = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    // Clamp to range
    const start = monthStart < rangeStart ? rangeStart : monthStart;
    const end = monthEnd > rangeEnd ? rangeEnd : monthEnd;
    if (start <= end) {
      ranges.push({ start, end, label: `${y}-${String(m).padStart(2, '0')}` });
    }
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return ranges;
}

async function main() {
  const { startDate: argStart, endDate, orgSlug } = parseArgs();

  let startDate: string;
  if (argStart) {
    startDate = argStart;
    console.log(`\n📅 Using provided start: ${startDate}`);
  } else {
    const earliest = await getEarliestMotiveDate();
    startDate = earliest ?? FALLBACK_START;
    console.log(`\n📅 Earliest Motive data in DB: ${earliest ?? 'none'}`);
    console.log(`   Range start: ${startDate} → end: ${endDate}`);
  }

  if (startDate > endDate) {
    console.log('Start is after end; nothing to do.');
    process.exit(0);
  }

  const accountWhere = {
    provider: 'MOTIVE' as const,
    status: 'ACTIVE' as const,
    ...(orgSlug ? { clerkOrgId: orgSlug } : {}),
  };
  const accounts = await appPrisma.telematicsProviderAccount.findMany({
    where: accountWhere,
    select: { clerkOrgId: true },
  });

  if (accounts.length === 0) {
    if (orgSlug) {
      console.log(`No active Motive account found for org ${orgSlug}. Exiting.`);
    } else {
      console.log('No active Motive orgs found. Exiting.');
    }
    process.exit(0);
  }

  const months = getMonthRanges(startDate, endDate);
  console.log(`   Months to process: ${months.length}`);
  console.log(`   Orgs: ${accounts.length}${orgSlug ? ` (filtered to ${orgSlug})` : ''}\n`);

  for (let i = 0; i < months.length; i++) {
    const { start, end, label } = months[i];
    console.log(`\n${'='.repeat(60)}`);
    console.log(`MONTH ${i + 1}/${months.length}: ${label} (${start} → ${end})`);
    console.log(`${'='.repeat(60)}\n`);

    for (const { clerkOrgId } of accounts) {
      await backdateMotiveData({ clerkOrgId, startDate: start, endDate: end });
    }

    // Short pause between months
    if (i < months.length - 1) {
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  console.log('\n✅ Motive by-month re-run finished for all orgs and months.\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
