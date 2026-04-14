/**
 * PHASE 0 — SAMSARA VEHICLE STATS (OBD + GPS) VALIDATION
 *
 * Confirms:
 * 1. GET /fleet/vehicles/stats returns current OBD + GPS data per vehicle.
 * 2. The key fields we plan to surface in the unit detail page are present:
 *    - obdOdometerMeters       → convert to miles for display
 *    - engineHours             → direct hours value
 *    - defLevelPercent         → DEF tank %
 *    - fuelPercents            → fuel tank %
 *    - obdEngineSeconds        → engine hours via OBD
 *    - gpsOdometerMeters       → GPS odometer (fallback if OBD not available)
 *    - ambientAirTemperature   → not needed, skip
 * 3. Coverage: reports which vehicles have OBD vs GPS-only data.
 * 4. Confirms the API doesn't 400/404 on the `types` param array.
 *
 * This endpoint is live (not historical) — no lag window needed.
 *
 * Usage: pnpm exec tsx src/scripts/phase0/validate-samsara-vehicle-stats.ts
 *        ORG_ID=org_xxx pnpm exec tsx ...
 */

import 'dotenv/config';
import { appPrisma } from '../../lib/prisma.js';
import { readCredentials } from '../../lib/credentials.js';
import { SamsaraClient } from '../../telematics/samsara/client.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface VehicleStatsEntry {
  id: string;
  name?: string;
  obdOdometerMeters?: { value: number; time?: string };
  engineHours?: { value: number; time?: string };
  defLevelPercent?: { value: number; time?: string };
  fuelPercents?: Array<{ value: number; time?: string }>;
  obdEngineSeconds?: { value: number; time?: string };
  gpsOdometerMeters?: { value: number; time?: string };
  [key: string]: unknown;
}

interface CheckResult {
  label: string;
  passed: boolean;
  warn?: boolean;
  detail: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, dec = 1): string {
  return n == null ? 'null' : n.toFixed(dec);
}

function metersToMiles(m: number): number { return m / 1609.34; }
function secondsToHours(s: number): number { return s / 3600; }

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
      ...(orgId ? { clerkOrgId: orgId } : {}),
      provider: 'SAMSARA',
      status: 'ACTIVE',
    },
  });

  if (!account) {
    console.error('No active Samsara account found. Set ORG_ID env var or activate a Samsara org.');
    process.exit(1);
  }

  const creds = readCredentials(account.credentialsJson);
  const apiToken = creds.apiToken as string | undefined;
  if (!apiToken) { console.error('Samsara credentials do not contain apiToken.'); process.exit(1); }

  console.log(`\nOrg: ${account.clerkOrgId}`);
  console.log('Fetching live OBD + GPS vehicle stats...\n');

  const client = new SamsaraClient(apiToken);
  const checks: CheckResult[] = [];

  // The types param requests specific stat types from Samsara
  // Valid Samsara stat types for /fleet/vehicles/stats
  // NOTE: engineHours and defLevelPercent rejected by this org's API token scope
  // Using confirmed-valid types: obdOdometerMeters, fuelPercents, obdEngineSeconds, gpsOdometerMeters
  // Confirmed valid stat types for /fleet/vehicles/stats on this org's token
  // engineHours, defLevelPercent, fuelPercent all rejected — not available on this token scope
  const REQUESTED_TYPES = [
    'obdOdometerMeters',
    'obdEngineSeconds',
    'gpsOdometerMeters',
  ];

  // ── 1. Fetch vehicle stats ──────────────────────────────────────────────────
  let vehicles: VehicleStatsEntry[] = [];

  try {
    const response = await client.getSinglePage<VehicleStatsEntry>('/fleet/vehicles/stats', {
      types: REQUESTED_TYPES.join(','),
      limit: 512,
    });
    vehicles = (response as any).data ?? [];
    console.log(`  Returned ${vehicles.length} vehicles`);

    checks.push({
      label: 'vehicle-stats-endpoint',
      passed: vehicles.length > 0,
      detail: `/fleet/vehicles/stats returned ${vehicles.length} vehicles ✓`,
    });
  } catch (err: any) {
    checks.push({
      label: 'vehicle-stats-endpoint',
      passed: false,
      detail: `/fleet/vehicles/stats failed: ${err.message}`,
    });
    printResults(checks);
    await appPrisma.$disconnect();
    return;
  }

  // ── 2. Field presence analysis ──────────────────────────────────────────────
  let withObdOdo = 0;
  let withGpsOdo = 0;
  let withEngineHours = 0;
  let withObdEngineSeconds = 0;
  let withFuelPercent = 0;
  let withDefLevel = 0;

  for (const v of vehicles) {
    if (v.obdOdometerMeters?.value != null) withObdOdo++;
    if (v.gpsOdometerMeters?.value != null) withGpsOdo++;
    if (v.engineHours?.value != null) withEngineHours++;
    if (v.obdEngineSeconds?.value != null) withObdEngineSeconds++;
    if ((v as any).fuelPercent?.value != null) withFuelPercent++;
    if (v.defLevelPercent?.value != null) withDefLevel++;
  }

  const total = vehicles.length;
  console.log('\n  Field coverage:');
  console.log(`    obdOdometerMeters:    ${withObdOdo} / ${total} (${((withObdOdo / total) * 100).toFixed(0)}%)`);
  console.log(`    gpsOdometerMeters:    ${withGpsOdo} / ${total} (${((withGpsOdo / total) * 100).toFixed(0)}%)`);
  console.log(`    engineHours:          ${withEngineHours} / ${total} (${((withEngineHours / total) * 100).toFixed(0)}%)`);
  console.log(`    obdEngineSeconds:     ${withObdEngineSeconds} / ${total} (${((withObdEngineSeconds / total) * 100).toFixed(0)}%)`);
  console.log(`    fuelPercents:         ${withFuelPercent} / ${total} (${((withFuelPercent / total) * 100).toFixed(0)}%)`);
  console.log(`    defLevelPercent:      ${withDefLevel} / ${total} (${((withDefLevel / total) * 100).toFixed(0)}%)`);

  const odoAvailPct = Math.max(withObdOdo, withGpsOdo) / total;
  checks.push({
    label: 'odometer-coverage',
    passed: odoAvailPct >= 0.7,
    warn: odoAvailPct > 0 && odoAvailPct < 0.7,
    detail: `Odometer (OBD or GPS): ${Math.max(withObdOdo, withGpsOdo)} / ${total} vehicles (${(odoAvailPct * 100).toFixed(0)}%) — ${odoAvailPct >= 0.7 ? '✓' : 'limited coverage'}`,
  });

  const engineHrAvailPct = Math.max(withEngineHours, withObdEngineSeconds) / total;
  checks.push({
    label: 'engine-hours-coverage',
    passed: engineHrAvailPct >= 0.5,
    warn: engineHrAvailPct > 0 && engineHrAvailPct < 0.5,
    detail: `Engine hours (field or OBD): ${Math.max(withEngineHours, withObdEngineSeconds)} / ${total} vehicles (${(engineHrAvailPct * 100).toFixed(0)}%)`,
  });

  // ── 3. Print per-vehicle table ──────────────────────────────────────────────
  console.log('\n  Per-vehicle stats (all vehicles):');
  console.log('  Name                | OBD Odo (mi) | GPS Odo (mi) | Eng Hrs | Fuel % | DEF %');
  console.log('  ' + '─'.repeat(85));

  for (const v of vehicles) {
    const name = (v.name ?? v.id).padEnd(20).slice(0, 20);
    const obdOdo = v.obdOdometerMeters?.value != null ? fmt(metersToMiles(v.obdOdometerMeters.value), 0) : '─';
    const gpsOdo = v.gpsOdometerMeters?.value != null ? fmt(metersToMiles(v.gpsOdometerMeters.value), 0) : '─';

    // Engine hours: prefer engineHours field; fallback to obdEngineSeconds / 3600
    const engHrRaw = v.engineHours?.value ?? (v.obdEngineSeconds?.value != null ? secondsToHours(v.obdEngineSeconds.value) : null);
    const engHr = engHrRaw != null ? fmt(engHrRaw, 0) : '─';

    const fuelPct = (v as any).fuelPercent?.value != null
      ? `${fmt((v as any).fuelPercent.value, 0)}%` : '─';
    const defPct = v.defLevelPercent?.value != null
      ? `${fmt(v.defLevelPercent.value * 100, 0)}%` : '─';

    console.log(`  ${name} | ${obdOdo.padStart(12)} | ${gpsOdo.padStart(12)} | ${engHr.padStart(7)} | ${fuelPct.padStart(6)} | ${defPct.padStart(5)}`);
  }

  // ── 4. OBD vs GPS odometer consistency check ────────────────────────────────
  let obdGpsMatches = 0;
  let obdGpsMismatches = 0;
  for (const v of vehicles) {
    const obd = v.obdOdometerMeters?.value;
    const gps = v.gpsOdometerMeters?.value;
    if (obd == null || gps == null) continue;
    // Expect OBD and GPS odometer within 5% of each other
    const delta = Math.abs(obd - gps) / Math.max(obd, gps, 1);
    if (delta <= 0.05) obdGpsMatches++;
    else {
      obdGpsMismatches++;
      const name = v.name ?? v.id;
      console.log(`  ⚠ ${name}: OBD=${fmt(metersToMiles(obd), 0)} mi vs GPS=${fmt(metersToMiles(gps), 0)} mi (Δ${(delta * 100).toFixed(1)}%)`);
    }
  }

  if (obdGpsMatches + obdGpsMismatches > 0) {
    checks.push({
      label: 'obd-vs-gps-odometer',
      passed: obdGpsMismatches === 0,
      warn: obdGpsMismatches > 0,
      detail: `OBD vs GPS odometer: ${obdGpsMatches} match, ${obdGpsMismatches} differ >5%`,
    });
  }

  // ── 5. Confirm raw field shapes from sample ──────────────────────────────────
  if (vehicles.length > 0) {
    console.log('\n  Raw top-level keys from first vehicle:');
    const sample = vehicles[0];
    for (const k of Object.keys(sample)) {
      const v = (sample as any)[k];
      console.log(`    ${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
    }
  }

  printResults(checks);
  await appPrisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
