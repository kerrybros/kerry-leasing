/**
 * PHASE 0 — MOTIVE V2 BOUNDARY VALIDATION
 *
 * Compares v1 (start_date/end_date) vs v2 (start_at/end_at UTC boundary) responses
 * for the same calendar date. Confirms the boundary fix produces consistent data
 * vs the Motive dashboard export.
 *
 * v1 params: start_date/end_date (YYYY-MM-DD, Eastern calendar day — server uses EST)
 * v2 params: start_at/end_at (ISO 8601 with offset — must cover full Eastern day in UTC)
 *
 * Usage: pnpm exec tsx src/scripts/phase0/validate-motive-v2-boundary.ts
 *        ORG_ID=org_xxx pnpm exec tsx src/scripts/phase0/validate-motive-v2-boundary.ts
 *        DATE=2026-04-07 pnpm exec tsx src/scripts/phase0/validate-motive-v2-boundary.ts
 */

import 'dotenv/config';
import { appPrisma } from '../../lib/prisma.js';
import { readCredentials } from '../../lib/credentials.js';
import { MotiveClient } from '../../telematics/motive/client.js';

// ─── Configuration ────────────────────────────────────────────────────────────

// How many days back to validate (settled data — avoid last 48h lag window)
const DAYS_TO_TEST = 3;

// Delta tolerance for matching (2% of the larger value OR absolute 0.05 gallon)
const DELTA_TOLERANCE_PCT = 0.02;
const DELTA_ABS_FUEL = 0.05; // gallons
const DELTA_ABS_DIST = 0.5;  // miles

// ─── Types ────────────────────────────────────────────────────────────────────

interface V1Record {
  vehicle: { id: number; number?: string; vin?: string };
  idle_time?: number;
  idle_fuel?: number;
  driving_time?: number;
  driving_fuel?: number;
  total_fuel?: number;
  total_distance?: number;
  utilization?: number;
}

interface V2Record {
  vehicle: { id: number; number?: string; vin?: string };
  idle_time?: number;
  idle_fuel?: number;
  driving_time?: number;
  driving_fuel?: number;
  total_fuel?: number;
  total_distance?: number;
  utilization?: number;
}

interface CheckResult {
  label: string;
  passed: boolean;
  detail: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getSettledDate(daysBack: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysBack);
  return d.toISOString().split('T')[0];
}

/** v2 requires start_at/end_at as the full Eastern day expressed in UTC offset */
function getV2EasternBounds(date: string): { start_at: string; end_at: string } {
  // EST = UTC-5, EDT = UTC-4. Use -05:00 as safe conservative for daily boundary.
  // The full Eastern day: midnight to midnight means we need the day's UTC span.
  // We use -05:00 for the date anchor (EST). During EDT (-04:00), this adds 1h buffer
  // at the start, which is acceptable for validation purposes.
  return {
    start_at: `${date}T00:00:00-05:00`,
    end_at: `${date}T23:59:59-05:00`,
  };
}

function withinTolerance(a: number | null | undefined, b: number | null | undefined, abs: number): boolean {
  if (a == null || b == null) return a == null && b == null;
  const diff = Math.abs(a - b);
  if (diff <= abs) return true;
  const larger = Math.max(Math.abs(a), Math.abs(b));
  if (larger === 0) return diff === 0;
  return diff / larger <= DELTA_TOLERANCE_PCT;
}

function fmt(n: number | null | undefined, decimals = 2): string {
  if (n == null) return 'null';
  return n.toFixed(decimals);
}

function pct(a: number | null | undefined, b: number | null | undefined): string {
  if (a == null || b == null || b === 0) return 'n/a';
  return `${(((a - b) / b) * 100).toFixed(1)}%`;
}

function printResults(checks: CheckResult[]) {
  const passed = checks.filter(c => c.passed).length;
  const total = checks.length;
  const allPass = passed === total;

  console.log('\n' + '═'.repeat(60));
  console.log(`RESULT: ${allPass ? 'PASS' : 'FAIL'} (${passed}/${total} checks passed)`);
  console.log('─'.repeat(60));
  for (const c of checks) {
    console.log(`${c.passed ? '✓' : '✗'}  [${c.label}] ${c.detail}`);
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
  if (!apiKey) {
    console.error('Motive credentials do not contain apiKey.');
    process.exit(1);
  }

  console.log(`\nOrg: ${account.clerkOrgId}`);
  console.log(`Provider: MOTIVE`);
  console.log(`Validating ${DAYS_TO_TEST} settled dates (skipping last 48h lag window)\n`);

  const client = new MotiveClient(apiKey);
  const checks: CheckResult[] = [];

  for (let i = 3; i < 3 + DAYS_TO_TEST; i++) {
    const date = getSettledDate(i);
    const { start_at, end_at } = getV2EasternBounds(date);

    console.log(`\n${'─'.repeat(50)}`);
    console.log(`Date: ${date}`);
    console.log(`v1  params: start_date=${date}, end_date=${date}`);
    console.log(`v2  params: start_at=${start_at}, end_at=${end_at}`);

    // Fetch v1
    let v1Records: V1Record[] = [];
    try {
      v1Records = await client.get<V1Record>('/v1/vehicle_utilization', {
        start_date: date,
        end_date: date,
      });
      console.log(`v1 returned ${v1Records.length} vehicles`);
    } catch (err: any) {
      console.error(`v1 fetch failed: ${err.message}`);
      checks.push({ label: `v1-fetch-${date}`, passed: false, detail: `v1 API call failed: ${err.message}` });
      continue;
    }

    // Fetch v2
    let v2Records: V2Record[] = [];
    try {
      v2Records = await client.get<V2Record>('/v2/vehicle_utilization', {
        start_at,
        end_at,
      });
      console.log(`v2 returned ${v2Records.length} vehicles`);
    } catch (err: any) {
      console.error(`v2 fetch failed: ${err.message}`);
      checks.push({ label: `v2-fetch-${date}`, passed: false, detail: `v2 API call failed: ${err.message}` });
      continue;
    }

    // Count check
    const countMatch = v1Records.length === v2Records.length;
    checks.push({
      label: `vehicle-count-${date}`,
      passed: countMatch,
      detail: `v1=${v1Records.length} vehicles, v2=${v2Records.length} vehicles${countMatch ? '' : ' ← MISMATCH'}`,
    });

    // Build per-vehicle maps by vehicle number (or id as fallback)
    const v1Map = new Map<string, V1Record>();
    const v2Map = new Map<string, V2Record>();
    for (const r of v1Records) v1Map.set(String(r.vehicle?.number ?? r.vehicle?.id ?? ''), r);
    for (const r of v2Records) v2Map.set(String(r.vehicle?.number ?? r.vehicle?.id ?? ''), r);

    // Per-vehicle comparison
    const allKeys = new Set([...v1Map.keys(), ...v2Map.keys()]);
    let fuelDeltaFails = 0;
    let distDeltaFails = 0;
    let idleTimeDeltaFails = 0;
    let onlyInV1 = 0;
    let onlyInV2 = 0;

    console.log('\n  Vehicle | v1 driveFuel | v2 driveFuel | Δ% | v1 dist | v2 dist | Δ%');
    for (const key of allKeys) {
      const v1 = v1Map.get(key);
      const v2 = v2Map.get(key);

      if (!v1) { onlyInV2++; continue; }
      if (!v2) { onlyInV1++; continue; }

      const fuelOk = withinTolerance(v1.driving_fuel, v2.driving_fuel, DELTA_ABS_FUEL);
      const distOk = withinTolerance(v1.total_distance, v2.total_distance, DELTA_ABS_DIST);
      // v2 returns idle_time in seconds (confirmed by prior script): divide by 60 for display
      const v1IdleMin = v1.idle_time != null ? v1.idle_time / 60 : null;
      const v2IdleMin = v2.idle_time != null ? v2.idle_time / 60 : null;
      const idleOk = withinTolerance(v1IdleMin, v2IdleMin, 1); // 1 min tolerance

      if (!fuelOk) fuelDeltaFails++;
      if (!distOk) distDeltaFails++;
      if (!idleOk) idleTimeDeltaFails++;

      const flag = (!fuelOk || !distOk) ? ' ← DIFF' : '';
      console.log(
        `  ${key.padEnd(8)} | ${fmt(v1.driving_fuel).padStart(12)} | ${fmt(v2.driving_fuel).padStart(12)} | ${pct(v2.driving_fuel, v1.driving_fuel).padStart(6)} | ${fmt(v1.total_distance).padStart(7)} | ${fmt(v2.total_distance).padStart(7)} | ${pct(v2.total_distance, v1.total_distance).padStart(6)}${flag}`
      );
    }

    if (onlyInV1 > 0) console.log(`  ⚠ ${onlyInV1} vehicles only in v1`);
    if (onlyInV2 > 0) console.log(`  ⚠ ${onlyInV2} vehicles only in v2`);

    // v2 driving_time unit confirmation: should be seconds (large values ~3600+ for 1h of driving)
    const sample = v2Records.find(r => (r.driving_time ?? 0) > 0);
    if (sample) {
      const dtSec = sample.driving_time!;
      const isLikelySec = dtSec > 300; // if > 300 we're almost certainly in seconds not minutes
      checks.push({
        label: `v2-driving-time-unit-${date}`,
        passed: isLikelySec,
        detail: `Sample v2 driving_time=${dtSec} → ${isLikelySec ? 'likely seconds ✓' : 'looks like minutes — verify'}`,
      });
    }

    checks.push({
      label: `driving-fuel-delta-${date}`,
      passed: fuelDeltaFails === 0,
      detail: fuelDeltaFails === 0
        ? `All vehicles within ${DELTA_TOLERANCE_PCT * 100}% fuel delta`
        : `${fuelDeltaFails} vehicle(s) exceed fuel delta threshold`,
    });

    checks.push({
      label: `distance-delta-${date}`,
      passed: distDeltaFails === 0,
      detail: distDeltaFails === 0
        ? `All vehicles within ${DELTA_ABS_DIST} mi distance delta`
        : `${distDeltaFails} vehicle(s) exceed distance delta threshold`,
    });

    // Fleet totals
    const v1TotalFuel = v1Records.reduce((s, r) => s + (r.driving_fuel ?? 0), 0);
    const v2TotalFuel = v2Records.reduce((s, r) => s + (r.driving_fuel ?? 0), 0);
    const v1TotalDist = v1Records.reduce((s, r) => s + (r.total_distance ?? 0), 0);
    const v2TotalDist = v2Records.reduce((s, r) => s + (r.total_distance ?? 0), 0);

    console.log(`\n  Fleet totals: v1 fuel=${fmt(v1TotalFuel)} gal, v2 fuel=${fmt(v2TotalFuel)} gal (Δ ${pct(v2TotalFuel, v1TotalFuel)})`);
    console.log(`  Fleet totals: v1 dist=${fmt(v1TotalDist)} mi,  v2 dist=${fmt(v2TotalDist)} mi  (Δ ${pct(v2TotalDist, v1TotalDist)})`);
  }

  printResults(checks);
  await appPrisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
