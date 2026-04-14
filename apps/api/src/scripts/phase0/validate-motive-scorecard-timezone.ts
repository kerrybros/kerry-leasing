/**
 * PHASE 0 — MOTIVE SCORECARD TIMEZONE VALIDATION
 *
 * Confirms whether the scorecard rollup endpoint is affected by timezone bleed.
 * The Motive dashboard is set to Eastern Time; the API may return UTC-based day buckets.
 *
 * Validates:
 * 1. A 7-day scorecard total for driving distance against the sum of vehicle utilization
 *    total_distance for the same 7-day window. If the scorecard is in UTC and vehicle util
 *    is in Eastern, the totals should still match (different bucketing, same total). If they
 *    are wildly off, there is boundary bleed.
 *
 * 2. Confirms the scorecard uses start_date/end_date params (not start_at/end_at).
 *
 * 3. Prints per-vehicle scorecard vs vehicle_utilization comparison for audit.
 *
 * Usage: pnpm exec tsx src/scripts/phase0/validate-motive-scorecard-timezone.ts
 *        ORG_ID=org_xxx pnpm exec tsx ...
 */

import 'dotenv/config';
import { appPrisma } from '../../lib/prisma.js';
import { readCredentials } from '../../lib/credentials.js';
import { MotiveClient } from '../../telematics/motive/client.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScorecardRecord {
  vehicle?: { id: number; number?: string };
  driver?: { id: number; first_name?: string; last_name?: string };
  total_distance?: number;      // miles (imperial)
  total_drive_time?: number;    // seconds or minutes — compare with vehicle util
  total_idle_time?: number;
  driving_fuel?: number;
  idle_fuel?: number;
  total_fuel?: number;
  score?: number;
  [key: string]: unknown;
}

interface VehicleUtilRecord {
  vehicle?: { id: number; number?: string };
  total_distance?: number;
  driving_time?: number;
  idle_time?: number;
  driving_fuel?: number;
  idle_fuel?: number;
  total_fuel?: number;
}

interface CheckResult {
  label: string;
  passed: boolean;
  warn?: boolean;
  detail: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getSettledDate(daysBack: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysBack);
  return d.toISOString().split('T')[0];
}

function fmt(n: number | null | undefined, dec = 2): string {
  return n == null ? 'null' : n.toFixed(dec);
}

function pct(a: number, b: number): string {
  if (b === 0) return 'n/a';
  return `${(((a - b) / b) * 100).toFixed(1)}%`;
}

function printResults(checks: CheckResult[]) {
  const fails = checks.filter(c => !c.passed && !c.warn).length;
  const warns = checks.filter(c => c.warn).length;
  const pass = checks.filter(c => c.passed).length;
  const status = fails > 0 ? 'FAIL' : warns > 0 ? 'WARN' : 'PASS';

  console.log('\n' + '═'.repeat(60));
  console.log(`RESULT: ${status} (${pass} pass, ${warns} warn, ${fails} fail)`);
  console.log('─'.repeat(60));
  for (const c of checks) {
    const icon = c.passed ? '✓' : c.warn ? '⚠' : '✗';
    console.log(`${icon}  [${c.label}] ${c.detail}`);
  }
  console.log('═'.repeat(60) + '\n');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const orgId = process.env.ORG_ID;

  const account = await appPrisma.telematicsProviderAccount.findFirst({
    where: {
      ...(orgId ? { clerkOrgId: orgId } : { status: 'ACTIVE' }),
      provider: 'MOTIVE',
    },
  });

  if (!account) {
    console.error('No active Motive account found. Set ORG_ID env var or activate a Motive org.');
    process.exit(1);
  }

  const creds = readCredentials(account.credentialsJson);
  const apiKey = creds.apiKey as string | undefined;
  if (!apiKey) { console.error('Motive credentials do not contain apiKey.'); process.exit(1); }

  // Use a settled 7-day window ending 4 days ago (avoids 48h lag + weekend artifacts)
  const endDate = getSettledDate(4);
  const startDateObj = new Date(endDate + 'T00:00:00Z');
  startDateObj.setUTCDate(startDateObj.getUTCDate() - 6);
  const startDate = startDateObj.toISOString().split('T')[0];

  console.log(`\nOrg: ${account.clerkOrgId}`);
  console.log(`Window: ${startDate} → ${endDate} (7 days)\n`);

  const client = new MotiveClient(apiKey);
  const checks: CheckResult[] = [];

  // ── 1. Fetch scorecard summaries ─────────────────────────────────────────────
  console.log('Fetching /v1/scorecard_summary...');
  let scorecards: ScorecardRecord[] = [];

  try {
    scorecards = await client.get<ScorecardRecord>('/v1/scorecard_summary', {
      start_date: startDate,
      end_date: endDate,
    });
    console.log(`  Returned ${scorecards.length} scorecard records`);
    checks.push({
      label: 'scorecard-endpoint',
      passed: scorecards.length >= 0,
      detail: `/v1/scorecard_summary returned ${scorecards.length} records for ${startDate}–${endDate}`,
    });
  } catch (err: any) {
    checks.push({
      label: 'scorecard-endpoint',
      passed: false,
      detail: `/v1/scorecard_summary failed: ${err.message}`,
    });
    printResults(checks);
    await appPrisma.$disconnect();
    return;
  }

  // ── 2. Fetch vehicle utilization for same window (v1) ────────────────────────
  console.log('Fetching vehicle utilization for same 7-day window (v1)...');
  const utilByVehicleDay = new Map<string, VehicleUtilRecord>();
  let utilTotalDist = 0;
  let utilTotalFuel = 0;

  for (let offset = 0; offset < 7; offset++) {
    const d = new Date(startDate + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + offset);
    const dateStr = d.toISOString().split('T')[0];

    try {
      const records = await client.get<VehicleUtilRecord>('/v1/vehicle_utilization', {
        start_date: dateStr,
        end_date: dateStr,
      });
      for (const r of records) {
        const key = String(r.vehicle?.id ?? '');
        if (!key) continue;
        const existing = utilByVehicleDay.get(key) ?? { total_distance: 0, total_fuel: 0, driving_fuel: 0 };
        utilByVehicleDay.set(key, {
          vehicle: r.vehicle,
          total_distance: (existing.total_distance ?? 0) + (r.total_distance ?? 0),
          total_fuel: (existing.total_fuel ?? 0) + (r.total_fuel ?? 0),
          driving_fuel: (existing.driving_fuel ?? 0) + (r.driving_fuel ?? 0),
        });
        utilTotalDist += r.total_distance ?? 0;
        utilTotalFuel += r.total_fuel ?? 0;
      }
    } catch {
      // skip individual days
    }
  }

  console.log(`  Vehicle util totals: dist=${fmt(utilTotalDist)} mi, fuel=${fmt(utilTotalFuel)} gal`);

  // ── 3. Aggregate scorecard by vehicle ────────────────────────────────────────
  const scorecardByVehicle = new Map<string, { dist: number; fuel: number }>();
  let scorecardTotalDist = 0;
  let scorecardTotalFuel = 0;

  for (const s of scorecards) {
    const key = String(s.vehicle?.id ?? '');
    if (!key) continue;
    const dist = s.total_distance ?? 0;
    const fuel = s.total_fuel ?? s.driving_fuel ?? 0;
    scorecardByVehicle.set(key, { dist, fuel });
    scorecardTotalDist += dist;
    scorecardTotalFuel += fuel;
  }

  console.log(`  Scorecard totals:    dist=${fmt(scorecardTotalDist)} mi, fuel=${fmt(scorecardTotalFuel)} gal`);

  // ── 4. Compare totals ───────────────────────────────────────────────────────
  if (utilTotalDist > 0 && scorecardTotalDist > 0) {
    const distRatio = scorecardTotalDist / utilTotalDist;
    const fuelRatio = scorecardTotalFuel > 0 && utilTotalFuel > 0 ? scorecardTotalFuel / utilTotalFuel : null;
    const distOk = distRatio >= 0.85 && distRatio <= 1.15;
    const fuelOk = fuelRatio == null || (fuelRatio >= 0.85 && fuelRatio <= 1.15);

    checks.push({
      label: 'scorecard-vs-util-distance',
      passed: distOk,
      warn: !distOk,
      detail: `scorecard dist=${fmt(scorecardTotalDist)} mi vs util dist=${fmt(utilTotalDist)} mi — ratio=${distRatio.toFixed(3)} ${distOk ? '(within 15%) ✓' : '→ BOUNDARY BLEED SUSPECTED'}`,
    });

    if (fuelRatio != null) {
      checks.push({
        label: 'scorecard-vs-util-fuel',
        passed: fuelOk,
        warn: !fuelOk,
        detail: `scorecard fuel=${fmt(scorecardTotalFuel)} gal vs util fuel=${fmt(utilTotalFuel)} gal — ratio=${fuelRatio.toFixed(3)} ${fuelOk ? '(within 15%) ✓' : '→ BOUNDARY BLEED SUSPECTED'}`,
      });
    }
  } else {
    checks.push({
      label: 'scorecard-vs-util-distance',
      passed: false,
      warn: true,
      detail: `Cannot compare: scorecard dist=${fmt(scorecardTotalDist)}, util dist=${fmt(utilTotalDist)}`,
    });
  }

  // ── 5. Per-vehicle comparison table ─────────────────────────────────────────
  console.log('\n  Per-vehicle: scorecard vs vehicle_utilization (7-day totals)');
  console.log('  Vehicle | SC dist | Util dist | Δ% | SC fuel | Util fuel | Δ%');
  const allKeys = new Set([...scorecardByVehicle.keys(), ...utilByVehicleDay.keys()]);
  for (const key of allKeys) {
    const sc = scorecardByVehicle.get(key);
    const ut = utilByVehicleDay.get(key);
    const vNum = sc ? String(scorecards.find(s => String(s.vehicle?.id) === key)?.vehicle?.number ?? key)
      : String(ut?.vehicle?.number ?? key);
    const scDist = sc?.dist ?? 0;
    const utDist = ut?.total_distance ?? 0;
    const scFuel = sc?.fuel ?? 0;
    const utFuel = ut?.total_fuel ?? 0;
    console.log(`  ${vNum.padEnd(8)} | ${fmt(scDist).padStart(7)} | ${fmt(utDist).padStart(9)} | ${pct(scDist, utDist).padStart(6)} | ${fmt(scFuel).padStart(7)} | ${fmt(utFuel).padStart(9)} | ${pct(scFuel, utFuel).padStart(6)}`);
  }

  // ── 6. Print raw scorecard fields from sample record ────────────────────────
  if (scorecards.length > 0) {
    console.log('\n  Raw scorecard fields from first record:');
    for (const [k, v] of Object.entries(scorecards[0])) {
      if (typeof v === 'object' && v !== null) {
        console.log(`    ${k}: ${JSON.stringify(v)}`);
      } else {
        console.log(`    ${k}: ${v}`);
      }
    }
  }

  printResults(checks);
  await appPrisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
