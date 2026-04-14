/**
 * PHASE 0 — MOTIVE DRIVER UTILIZATION UNIT VALIDATION
 *
 * Confirms:
 * 1. Whether `driving_time` returned by /v2/driver_utilization is in SECONDS or MINUTES.
 *    The Motive dashboard shows minutes; the API spec is ambiguous on this endpoint.
 *    We cross-check by summing driver driving_time against vehicle driving_time for the
 *    same org and date — they should be in the same ballpark if on the same scale.
 *
 * 2. Whether fuel values (driving_fuel, idle_fuel) are in GALLONS (imperial) or LITERS.
 *    The client sends X-Metric-Units: false — this confirms the flag is respected.
 *
 * 3. Whether the v2 driver util endpoint path is /v1/ or /v2/ (the docs showed a
 *    discrepancy; the code calls /v2/driver_utilization — we confirm it's correct).
 *
 * Usage: pnpm exec tsx src/scripts/phase0/validate-motive-driver-util-units.ts
 *        ORG_ID=org_xxx DATE=2026-04-07 pnpm exec tsx ...
 */

import 'dotenv/config';
import { appPrisma } from '../../lib/prisma.js';
import { readCredentials } from '../../lib/credentials.js';
import { MotiveClient } from '../../telematics/motive/client.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DriverUtilRecord {
  driver?: { id: number; first_name?: string; last_name?: string; username?: string };
  idle_time?: number;
  idle_fuel?: number;
  driving_time?: number;
  driving_fuel?: number;
  total_fuel?: number;
  total_distance?: number;
  utilization?: number;
}

interface VehicleUtilRecord {
  vehicle?: { id: number; number?: string };
  idle_time?: number;
  idle_fuel?: number;
  driving_time?: number;
  driving_fuel?: number;
  total_distance?: number;
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

function printResults(checks: CheckResult[]) {
  const fails = checks.filter(c => !c.passed && !c.warn).length;
  const warns = checks.filter(c => c.warn && !c.passed).length;
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
  const dateOverride = process.env.DATE;

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

  const date = dateOverride ?? getSettledDate(3); // 3 days back = settled

  console.log(`\nOrg: ${account.clerkOrgId}`);
  console.log(`Date: ${date}\n`);

  const client = new MotiveClient(apiKey);
  const checks: CheckResult[] = [];

  // ── 1. Fetch driver utilization via /v2/driver_utilization ──────────────────
  console.log('Fetching /v2/driver_utilization...');
  let driverRecords: DriverUtilRecord[] = [];
  try {
    driverRecords = await client.get<DriverUtilRecord>('/v2/driver_utilization', {
      start_date: date,
      end_date: date,
    });
    console.log(`  Returned ${driverRecords.length} driver records`);
    checks.push({
      label: 'driver-util-endpoint',
      passed: driverRecords.length > 0,
      detail: driverRecords.length > 0
        ? `/v2/driver_utilization returned ${driverRecords.length} records ✓`
        : '/v2/driver_utilization returned 0 records — endpoint may be wrong path or no drivers active',
    });
  } catch (err: any) {
    console.error(`  /v2/driver_utilization failed: ${err.message}`);

    // Try /v1/ as fallback to detect which path is correct
    console.log('  Trying /v1/driver_utilization as fallback...');
    try {
      const v1Records = await client.get<DriverUtilRecord>('/v1/driver_utilization', {
        start_date: date,
        end_date: date,
      });
      console.log(`  /v1/ returned ${v1Records.length} records`);
      checks.push({
        label: 'driver-util-endpoint',
        passed: false,
        detail: `/v2/ failed but /v1/driver_utilization returned ${v1Records.length} records — CODE MUST USE /v1/ NOT /v2/`,
      });
      driverRecords = v1Records;
    } catch (e2: any) {
      checks.push({
        label: 'driver-util-endpoint',
        passed: false,
        detail: `Both /v2/ and /v1/ driver_utilization failed: ${e2.message}`,
      });
      printResults(checks);
      await appPrisma.$disconnect();
      return;
    }
  }

  // ── 2. Fetch vehicle utilization for same date (v1) for cross-check ─────────
  console.log('Fetching /v1/vehicle_utilization for cross-check...');
  let vehicleRecords: VehicleUtilRecord[] = [];
  try {
    vehicleRecords = await client.get<VehicleUtilRecord>('/v1/vehicle_utilization', {
      start_date: date,
      end_date: date,
    });
    console.log(`  Returned ${vehicleRecords.length} vehicle records`);
  } catch (err: any) {
    console.warn(`  Vehicle utilization fetch failed: ${err.message}`);
  }

  // ── 3. Determine driving_time unit for driver records ───────────────────────
  const driversWithDriving = driverRecords.filter(r => (r.driving_time ?? 0) > 0);

  if (driversWithDriving.length === 0) {
    checks.push({
      label: 'driving-time-unit',
      passed: false,
      warn: true,
      detail: 'No drivers with driving_time > 0 on this date — cannot determine unit. Try a busier date.',
    });
  } else {
    const sampleDt = driversWithDriving[0].driving_time!;
    // If in seconds: values should be ~1000+ for even a short trip
    // If in minutes: values should be ~15-600 for a normal shift
    // Heuristic: if median > 600, likely seconds; if median < 300 and reasonable, likely minutes
    const sortedDt = driversWithDriving.map(r => r.driving_time!).sort((a, b) => a - b);
    const median = sortedDt[Math.floor(sortedDt.length / 2)];
    const sum = sortedDt.reduce((s, v) => s + v, 0);

    // Cross-check: sum of driver driving_time vs sum of vehicle driving_time
    const vehDtSum = vehicleRecords.reduce((s, r) => s + (r.driving_time ?? 0), 0);

    console.log('\n  Driver driving_time stats:');
    console.log(`    Count: ${driversWithDriving.length}`);
    console.log(`    Sample (first): ${sampleDt}`);
    console.log(`    Median: ${median}`);
    console.log(`    Sum: ${sum}`);
    console.log(`    Vehicle driving_time sum (v1): ${vehDtSum}`);
    console.log(`    Ratio (driver_sum / veh_sum): ${vehDtSum > 0 ? (sum / vehDtSum).toFixed(3) : 'n/a'}`);

    // If both are in same units, driver sum ≈ vehicle sum (different aggregation axis but same fleet)
    const likelySeconds = median > 600;

    checks.push({
      label: 'driving-time-unit',
      passed: true, // informational — print what we found
      warn: false,
      detail: `driving_time median=${median} → likely in ${likelySeconds ? 'SECONDS' : 'MINUTES'} (${likelySeconds ? 'divide by 60 for minutes' : 'already minutes'})`,
    });

    // Check: if driver sum and vehicle sum are wildly different multiples, flag it
    if (vehDtSum > 0) {
      const ratio = sum / vehDtSum;
      // Expect ratio near 1.0 if both in same units (drivers ≈ vehicles for the org)
      // Or ratio near 60 if one is seconds and the other minutes
      const nearOne = ratio >= 0.5 && ratio <= 2.0;
      const nearSixty = ratio >= 30 && ratio <= 120;
      checks.push({
        label: 'driving-time-unit-cross-check',
        passed: nearOne || nearSixty,
        warn: nearSixty,
        detail: nearOne
          ? `Driver/vehicle sum ratio=${ratio.toFixed(2)} ≈ 1.0 → same units confirmed`
          : nearSixty
          ? `Driver/vehicle sum ratio=${ratio.toFixed(2)} ≈ 60 → UNIT MISMATCH: driver is minutes, vehicle is seconds (or vice versa)`
          : `Driver/vehicle sum ratio=${ratio.toFixed(2)} unexpected — check manually`,
      });
    }
  }

  // ── 4. Confirm fuel unit (gallons) ─────────────────────────────────────────
  const driversWithFuel = driverRecords.filter(r => (r.driving_fuel ?? 0) > 0);

  if (driversWithFuel.length === 0) {
    checks.push({
      label: 'fuel-unit',
      passed: false,
      warn: true,
      detail: 'No drivers with driving_fuel > 0 — cannot confirm unit. Try a date with activity.',
    });
  } else {
    const sampleFuel = driversWithFuel[0].driving_fuel!;
    // Gallons: typical diesel truck uses 5–30 gallons/day
    // Liters: same truck uses ~19–115 liters/day
    // If value > 100, almost certainly liters; if < 100, likely gallons
    const likelyGallons = sampleFuel <= 100;

    console.log('\n  Driver driving_fuel samples:');
    driversWithFuel.slice(0, 5).forEach(r => {
      const name = `${r.driver?.first_name ?? ''} ${r.driver?.last_name ?? ''}`.trim() || String(r.driver?.id ?? '?');
      console.log(`    ${name}: ${fmt(r.driving_fuel)} | idle_fuel=${fmt(r.idle_fuel)} | total_distance=${fmt(r.total_distance)}`);
    });

    checks.push({
      label: 'fuel-unit',
      passed: likelyGallons,
      warn: !likelyGallons,
      detail: likelyGallons
        ? `driving_fuel sample=${fmt(sampleFuel)} → plausible gallons (X-Metric-Units: false respected) ✓`
        : `driving_fuel sample=${fmt(sampleFuel)} > 100 → may be LITERS — check X-Metric-Units header`,
    });
  }

  // ── 5. Print sample driver rows ─────────────────────────────────────────────
  console.log('\n  Driver utilization sample (first 8 rows):');
  console.log('  Driver | drivingTime | idleTime | drivingFuel(gal) | idleFuel(gal) | distance(mi)');
  for (const r of driverRecords.slice(0, 8)) {
    const name = `${r.driver?.first_name ?? ''} ${r.driver?.last_name ?? ''}`.trim() || String(r.driver?.id ?? '?');
    console.log(`  ${name.padEnd(20)} | ${String(r.driving_time ?? 'null').padStart(11)} | ${String(r.idle_time ?? 'null').padStart(8)} | ${fmt(r.driving_fuel).padStart(16)} | ${fmt(r.idle_fuel).padStart(13)} | ${fmt(r.total_distance).padStart(12)}`);
  }

  printResults(checks);
  await appPrisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
