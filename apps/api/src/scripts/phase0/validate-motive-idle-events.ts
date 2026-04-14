/**
 * PHASE 0 — MOTIVE IDLE EVENTS VALIDATION
 *
 * Confirms:
 * 1. Whether GET /v1/idle_events works WITHOUT driver_ids or vehicle_ids (get-all).
 *    Motive docs mark these as "required" but that may be wrong.
 *
 * 2. If get-all fails, tests with all vehicle IDs explicitly and compares totals.
 *
 * 3. Fuel unit: confirms events return gallons (not liters) given X-Metric-Units: false.
 *    Heuristic: typical idle event for a diesel truck idles 5-60 min at ~0.5-1 gal/hr
 *    → per-event fuel should be 0.04–1.0 gal. Values > 5 suggest liters.
 *
 * 4. Cross-checks sum of idle_fuel from events vs idle_fuel from vehicle utilization
 *    (v1) for the same date. They should be within a reasonable range.
 *
 * 5. Confirms events have valid lat/lon fields for mapping.
 *
 * Usage: pnpm exec tsx src/scripts/phase0/validate-motive-idle-events.ts
 *        ORG_ID=org_xxx DATE=2026-04-07 pnpm exec tsx ...
 */

import 'dotenv/config';
import { appPrisma } from '../../lib/prisma.js';
import { readCredentials } from '../../lib/credentials.js';
import { MotiveClient } from '../../telematics/motive/client.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface IdleEvent {
  id?: number;
  driver?: { id: number; first_name?: string; last_name?: string };
  vehicle?: { id: number; number?: string };
  start_time?: string;
  end_time?: string;
  duration?: number;      // seconds
  idle_fuel?: number;     // gallons (if X-Metric-Units: false)
  lat?: number;
  lon?: number;
  location?: string;
  [key: string]: unknown;
}

interface VehicleUtilRecord {
  vehicle?: { id: number; number?: string };
  idle_fuel?: number;
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

function fmt(n: number | null | undefined, dec = 3): string {
  return n == null ? 'null' : n.toFixed(dec);
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

  const date = dateOverride ?? getSettledDate(3);

  console.log(`\nOrg: ${account.clerkOrgId}`);
  console.log(`Date: ${date}\n`);

  const client = new MotiveClient(apiKey);
  const checks: CheckResult[] = [];

  // ── 1. Get-all test (no driver_ids / vehicle_ids) ──────────────────────────
  console.log('Test 1: GET /v1/idle_events WITHOUT any ID filter...');
  let getAllEvents: IdleEvent[] = [];
  let getAllWorked = false;

  try {
    getAllEvents = await client.get<IdleEvent>('/v1/idle_events', {
      start_time: `${date}T00:00:00`,
      end_time: `${date}T23:59:59`,
    });
    getAllWorked = true;
    console.log(`  ✓ get-all returned ${getAllEvents.length} events`);
    checks.push({
      label: 'idle-events-get-all',
      passed: true,
      detail: `GET /v1/idle_events without IDs returned ${getAllEvents.length} events (no 400/422 error)`,
    });
  } catch (err: any) {
    console.warn(`  ✗ get-all failed: ${err.message}`);
    checks.push({
      label: 'idle-events-get-all',
      passed: false,
      warn: true,
      detail: `GET /v1/idle_events without IDs failed (${err.message}) — must pass vehicle_ids explicitly`,
    });
  }

  // ── 2. If get-all failed, try with explicit vehicle IDs ─────────────────────
  let filteredEvents: IdleEvent[] = [];
  if (!getAllWorked) {
    console.log('\nTest 2: GET /v1/idle_events WITH explicit vehicle_ids...');

    const vehicleRecords = await client.get<VehicleUtilRecord>('/v1/vehicle_utilization', {
      start_date: date,
      end_date: date,
    }).catch(() => [] as VehicleUtilRecord[]);

    const vehicleIds = vehicleRecords
      .map(r => r.vehicle?.id)
      .filter((id): id is number => id != null);

    if (vehicleIds.length === 0) {
      checks.push({
        label: 'idle-events-filtered',
        passed: false,
        detail: 'No vehicle IDs found from vehicle_utilization — cannot test filtered idle events',
      });
    } else {
      try {
        filteredEvents = await client.get<IdleEvent>('/v1/idle_events', {
          start_time: `${date}T00:00:00`,
          end_time: `${date}T23:59:59`,
          vehicle_ids: vehicleIds.join(','),
        });
        console.log(`  Filtered by ${vehicleIds.length} vehicle IDs → ${filteredEvents.length} events`);
        checks.push({
          label: 'idle-events-filtered',
          passed: filteredEvents.length >= 0,
          detail: `GET /v1/idle_events with vehicle_ids filter: ${filteredEvents.length} events returned (${vehicleIds.length} vehicles)`,
        });
      } catch (err: any) {
        checks.push({
          label: 'idle-events-filtered',
          passed: false,
          detail: `Filtered idle events also failed: ${err.message}`,
        });
      }
    }
  }

  const events = getAllWorked ? getAllEvents : filteredEvents;

  if (events.length === 0) {
    checks.push({ label: 'idle-events-data', passed: false, warn: true, detail: 'No idle events returned — try a different date or check org activity' });
    printResults(checks);
    await appPrisma.$disconnect();
    return;
  }

  // ── 3. Fuel unit check ──────────────────────────────────────────────────────
  const eventsWithFuel = events.filter(e => (e.idle_fuel ?? 0) > 0);
  console.log(`\n  Events with idle_fuel > 0: ${eventsWithFuel.length} / ${events.length}`);

  if (eventsWithFuel.length > 0) {
    const fuelValues = eventsWithFuel.map(e => e.idle_fuel!).sort((a, b) => a - b);
    const median = fuelValues[Math.floor(fuelValues.length / 2)];
    const max = fuelValues[fuelValues.length - 1];
    const min = fuelValues[0];
    const sum = fuelValues.reduce((s, v) => s + v, 0);

    console.log(`  idle_fuel → min=${fmt(min)}, median=${fmt(median)}, max=${fmt(max)}, sum=${fmt(sum)}`);

    // Typical diesel idle: ~0.8 gal/hr. A 30-min event = ~0.4 gal. A 2-hr event = ~1.6 gal.
    // If values are routinely > 5, they may be in liters.
    const likelyGallons = median <= 5.0;
    checks.push({
      label: 'idle-fuel-unit',
      passed: likelyGallons,
      warn: !likelyGallons,
      detail: likelyGallons
        ? `idle_fuel median=${fmt(median)} — plausible gallons ✓`
        : `idle_fuel median=${fmt(median)} > 5 — may be LITERS (check X-Metric-Units header)`,
    });
  } else {
    checks.push({
      label: 'idle-fuel-unit',
      passed: false,
      warn: true,
      detail: 'No events have idle_fuel populated — cannot confirm fuel unit',
    });
  }

  // ── 4. Cross-check idle_fuel sum vs vehicle utilization idle_fuel ────────────
  const eventFuelByVehicle = new Map<number, number>();
  for (const e of eventsWithFuel) {
    const vid = e.vehicle?.id;
    if (vid == null) continue;
    eventFuelByVehicle.set(vid, (eventFuelByVehicle.get(vid) ?? 0) + (e.idle_fuel ?? 0));
  }

  const vehicleUtil = await client.get<VehicleUtilRecord>('/v1/vehicle_utilization', {
    start_date: date,
    end_date: date,
  }).catch(() => [] as VehicleUtilRecord[]);

  const utilFuelByVehicle = new Map<number, number>();
  for (const r of vehicleUtil) {
    const vid = r.vehicle?.id;
    if (vid == null) continue;
    utilFuelByVehicle.set(vid, r.idle_fuel ?? 0);
  }

  const eventTotalFuel = [...eventFuelByVehicle.values()].reduce((s, v) => s + v, 0);
  const utilTotalFuel = [...utilFuelByVehicle.values()].reduce((s, v) => s + v, 0);

  console.log(`\n  Idle events total idle_fuel: ${fmt(eventTotalFuel)} gal`);
  console.log(`  Vehicle util total idle_fuel: ${fmt(utilTotalFuel)} gal`);

  if (utilTotalFuel > 0) {
    const ratio = eventTotalFuel / utilTotalFuel;
    const withinRange = ratio >= 0.5 && ratio <= 1.5;
    checks.push({
      label: 'idle-fuel-cross-check',
      passed: withinRange,
      warn: !withinRange,
      detail: `idle events sum=${fmt(eventTotalFuel)} gal vs vehicle util sum=${fmt(utilTotalFuel)} gal — ratio=${ratio.toFixed(2)} ${withinRange ? '(within range) ✓' : '(OUTSIDE range — investigate)'}`,
    });
  } else {
    checks.push({
      label: 'idle-fuel-cross-check',
      passed: false,
      warn: true,
      detail: 'Vehicle utilization idle_fuel is 0 — cannot cross-check',
    });
  }

  // ── 5. Lat/lon presence for mapping ────────────────────────────────────────
  const withLocation = events.filter(e => e.lat != null && e.lon != null);
  const locationPct = events.length > 0 ? (withLocation.length / events.length) * 100 : 0;
  console.log(`\n  Events with lat/lon: ${withLocation.length} / ${events.length} (${locationPct.toFixed(0)}%)`);

  checks.push({
    label: 'idle-events-location',
    passed: locationPct >= 50,
    warn: locationPct > 0 && locationPct < 50,
    detail: `${locationPct.toFixed(0)}% of events have lat/lon — ${locationPct >= 50 ? 'sufficient for heatmap ✓' : locationPct > 0 ? 'partial coverage — heatmap will have gaps' : 'NO location data — heatmap not possible'}`,
  });

  // ── 6. Sample events ─────────────────────────────────────────────────────────
  console.log('\n  Sample idle events (first 5):');
  console.log('  Vehicle | Driver | start_time | duration(min) | idle_fuel | lat | lon');
  for (const e of events.slice(0, 5)) {
    const veh = e.vehicle?.number ?? String(e.vehicle?.id ?? '?');
    const drv = e.driver ? `${e.driver.first_name ?? ''} ${e.driver.last_name ?? ''}`.trim() : 'no driver';
    const dur = e.duration != null ? (e.duration / 60).toFixed(1) : 'null';
    console.log(`  ${veh.padEnd(8)} | ${drv.padEnd(15)} | ${e.start_time ?? 'null'} | ${dur.padStart(13)} | ${fmt(e.idle_fuel).padStart(9)} | ${fmt(e.lat, 4)} | ${fmt(e.lon, 4)}`);
  }

  // ── 7. Print all raw keys from first event (for schema discovery) ───────────
  if (events.length > 0) {
    console.log('\n  Raw fields from first event:');
    const sample = events[0];
    for (const [k, v] of Object.entries(sample)) {
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
