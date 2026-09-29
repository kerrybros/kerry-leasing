/**
 * Backfill daily Motive "Driver Fuel Performance" windows.
 *
 * The nightly pull only reaches back 14 days, so the driver detail page and any
 * range longer than that silently fell back to the API for older dates. This
 * walks back a given number of days and pulls each missing day individually.
 *
 * Daily tiles are enough to make ANY range up to the backfilled depth
 * report-backed: tileRange lays non-overlapping windows end to end, and the
 * aggregation sums additive quantities (miles, fuel, idle/driving time) and
 * derives MPG from the summed miles and fuel, so seven daily files aggregate
 * to exactly what one weekly file would give. Where a wider window already
 * exists the tiler prefers it, because it carries Motive's retroactive edits.
 *
 * Resumable by design: days that already have an ACCEPTED ingest are skipped,
 * so a run that dies partway can simply be run again. Days stored UNVERIFIED
 * (the report was missing a driver the API shows as active) are retried, since
 * Motive's batch may have caught up since.
 *
 * This deliberately does NOT record a telematics cron run. A backfill is not a
 * scheduled run, and recording one would tell the health check the nightly
 * pull is fresh when it may not be.
 *
 *   pnpm exec tsx src/scripts/backfill-motive-report-daily.ts \
 *     [--days=90] [--end=YYYY-MM-DD] [--only-org=<id>] [--force] [--dry-run]
 */
import { getAppPrisma } from '../lib/prisma.js';
import { readCredentials } from '../lib/credentials.js';
import { pullOrg, type PullWindow } from '../features/motiveReport/portalPull.js';
import { addDays, ymdInEastern } from '../features/motiveReport/reportWindow.js';
import {
  MotiveReportGranularity,
  MotiveReportIngestStatus,
  TelematicsProvider,
  TelematicsProviderStatus,
} from '../generated/app-client/index.js';

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
}

async function main() {
  const days = Number(arg('days') ?? 90);
  const force = process.argv.includes('--force');
  const dryRun = process.argv.includes('--dry-run');
  const onlyOrgId = arg('only-org');
  // Windows must end on or before yesterday: today is still accumulating.
  const end = arg('end') ?? addDays(ymdInEastern(new Date()), -1);

  if (!Number.isFinite(days) || days < 1) throw new Error(`--days must be a positive number, got ${arg('days')}`);

  const start = addDays(end, -(days - 1));
  console.log(`[backfill] ${days} day(s) ${start}..${end} dryRun=${dryRun} force=${force}`);

  const prisma = getAppPrisma();
  const accounts = await prisma.telematicsProviderAccount.findMany({
    where: {
      provider: TelematicsProvider.MOTIVE,
      status: TelematicsProviderStatus.ACTIVE,
      ...(onlyOrgId ? { clerkOrgId: onlyOrgId } : {}),
    },
    select: { clerkOrgId: true, credentialsJson: true },
  });

  let exitCode = 0;
  for (const a of accounts) {
    const creds = readCredentials(a.credentialsJson);
    const email = creds.portalEmail as string | undefined;
    const password = creds.portalPassword as string | undefined;
    if (!email || !password) {
      console.log(`[backfill] ${a.clerkOrgId}: no portal credentials, skipping`);
      continue;
    }

    const have = new Set<string>();
    if (!force) {
      const existing = await prisma.motiveReportIngest.findMany({
        where: {
          clerkOrgId: a.clerkOrgId,
          granularity: MotiveReportGranularity.DAY,
          status: MotiveReportIngestStatus.ACCEPTED,
          windowStart: { gte: start },
          windowEnd: { lte: end },
        },
        select: { windowStart: true },
      });
      for (const e of existing) have.add(e.windowStart);
    }

    const windows: PullWindow[] = [];
    for (let d = start; d <= end; d = addDays(d, 1)) {
      if (!have.has(d)) windows.push({ windowStart: d, windowEnd: d });
    }

    console.log(`[backfill] ${a.clerkOrgId}: ${have.size} day(s) already stored, ${windows.length} to pull`);
    if (windows.length === 0) continue;

    const res = await pullOrg(a.clerkOrgId, email, password, windows, { dryRun });
    if (res.error) {
      console.error(`[backfill] ${a.clerkOrgId}: ${res.error}`);
      exitCode = 1;
      continue;
    }

    const stored = res.windows.filter((w) => w.status === 'stored');
    const unverified = res.windows.filter((w) => w.status === 'unverified');
    const failed = res.windows.filter((w) => w.status === 'error');
    for (const w of [...unverified, ...failed]) {
      console.log(`  ${w.status.padEnd(10)} ${w.windowStart} :: ${w.error ?? ''}`);
    }
    console.log(
      `[backfill] ${a.clerkOrgId}: stored=${stored.length} unverified=${unverified.length} failed=${failed.length} in ${Math.round(res.duration / 1000)}s`
    );
    if (failed.length > 0) exitCode = 1;
  }

  await prisma.$disconnect();
  process.exit(exitCode);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
