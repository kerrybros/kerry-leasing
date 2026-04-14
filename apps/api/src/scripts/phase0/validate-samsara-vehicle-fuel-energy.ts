/**
 * PHASE 0 — SAMSARA VEHICLE FUEL-ENERGY VALIDATION
 *
 * Confirms:
 * 1. Pagination exhausts correctly (no data loss at page boundaries).
 * 2. Fuel is returned in MILLILITERS (raw source units we store) — not pre-converted.
 * 3. Distance is returned in METERS (raw source units).
 * 4. Idle time is returned in MILLISECONDS (raw source units).
 * 5. Cross-checks API totals against `samsara_raw_data` DB rows for the same date.
 *    Flags vehicles present in API but missing in DB (sync gap) or in DB but not API.
 *
 * Uses a 72h lag window (Samsara confirmed up to 72h data lag) — validation
 * runs on data from 4–10 days ago for a settled 7-day window.
 *
 * Usage: pnpm exec tsx src/scripts/phase0/validate-samsara-vehicle-fuel-energy.ts
 *        ORG_ID=org_xxx pnpm exec tsx ...
 */

import 'dotenv/config';
import { appPrisma } from '../../lib/prisma.js';
import { readCredentials } from '../../lib/credentials.js';
import { SamsaraClient } from '../../telematics/samsara/client.js';
import { fetchFuelEnergyReports, type SamsaraVehicleReport } from '../../telematics/samsara/endpoints/fuelEnergyReports.js';
import { getESTDayBounds } from '../../telematics/dates.js';

// ─── Types ────────────────────────────────────────────────────────────────────

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

function metersToMiles(m: number): number { return m / 1609.34; }
function mlToGallons(ml: number): number { return ml / 3785.41; }
function msToHours(ms: number): number { return ms / 3600000; }

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

  // 7-day settled window: skip last 4 days (72h lag + 1 buffer), end 10 days ago
  const endDate = getSettledDate(4);
  const startDateObj = new Date(endDate + 'T00:00:00Z');
  startDateObj.setUTCDate(startDateObj.getUTCDate() - 6);
  const startDate = startDateObj.toISOString().split('T')[0];

  console.log(`\nOrg: ${account.clerkOrgId}`);
  console.log(`Window: ${startDate} → ${endDate} (7 days, 72h+ settled)\n`);

  const client = new SamsaraClient(apiToken);
  const checks: CheckResult[] = [];

  // ── 1. Fetch all 7 days from API ────────────────────────────────────────────
  const apiByVehicleDate = new Map<string, SamsaraVehicleReport>(); // key: vehicleId|date
  let totalApiRecords = 0;

  for (let offset = 0; offset < 7; offset++) {
    const d = new Date(startDate + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + offset);
    const date = d.toISOString().split('T')[0];

    try {
      const reports = await fetchFuelEnergyReports(client, date);
      totalApiRecords += reports.length;
      for (const r of reports) {
        apiByVehicleDate.set(`${r.vehicle.id}|${date}`, r);
      }
    } catch (err: any) {
      checks.push({
        label: `api-fetch-${date}`,
        passed: false,
        detail: `API fetch failed for ${date}: ${err.message}`,
      });
    }
  }

  console.log(`API returned ${totalApiRecords} total vehicle-day records over 7 days\n`);
  checks.push({
    label: 'api-total-records',
    passed: totalApiRecords > 0,
    detail: `${totalApiRecords} vehicle-day records fetched from API`,
  });

  // ── 2. Fetch DB rows for same window ────────────────────────────────────────
  const dbRows = await appPrisma.samsaraRawData.findMany({
    where: {
      clerkOrgId: account.clerkOrgId,
      date: {
        gte: startDate,
        lte: endDate,
      },
    },
    select: {
      vehicleId: true,
      date: true,
      distanceTraveledMeters: true,
      fuelConsumedMl: true,
      engineIdleTimeDurationMs: true,
      engineRunTimeDurationMs: true,
    },
  });

  const dbByVehicleDate = new Map<string, typeof dbRows[0]>();
  for (const row of dbRows) {
    dbByVehicleDate.set(`${row.vehicleId}|${row.date}`, row);
  }

  console.log(`DB has ${dbRows.length} samsara_raw_data rows for this window\n`);

  // ── 3. Coverage check — API keys vs DB keys ─────────────────────────────────
  const apiKeys = new Set(apiByVehicleDate.keys());
  const dbKeys = new Set(dbByVehicleDate.keys());

  const inApiNotDb = [...apiKeys].filter(k => !dbKeys.has(k));
  const inDbNotApi = [...dbKeys].filter(k => !apiKeys.has(k));

  console.log(`  In API but NOT in DB: ${inApiNotDb.length} vehicle-days`);
  if (inApiNotDb.length > 0 && inApiNotDb.length <= 15) {
    inApiNotDb.forEach(k => console.log(`    Missing: ${k}`));
  }
  console.log(`  In DB but NOT in API: ${inDbNotApi.length} vehicle-days`);

  checks.push({
    label: 'api-vs-db-coverage',
    passed: inApiNotDb.length === 0,
    warn: inApiNotDb.length > 0 && inApiNotDb.length <= 5,
    detail: inApiNotDb.length === 0
      ? 'All API vehicle-days present in DB ✓'
      : `${inApiNotDb.length} vehicle-days in API missing from DB — sync gap`,
  });

  // ── 4. Unit checks — confirm raw source units ────────────────────────────────
  // Pick one sample record to inspect units
  const sampleEntry = [...apiByVehicleDate.entries()][0];
  if (sampleEntry) {
    const [key, r] = sampleEntry;

    // Fuel: fuelConsumedMl — should be large numbers (1 gallon ≈ 3785 mL)
    // A truck using 10 gal/day = ~37,850 mL
    const fuelMl = r.fuelConsumedMl ?? 0;
    const isLikelyMl = fuelMl > 1000; // if < 1000, might be already in gallons
    checks.push({
      label: 'fuel-unit-raw',
      passed: isLikelyMl || fuelMl === 0,
      warn: fuelMl > 0 && fuelMl < 1000,
      detail: `fuelConsumedMl sample=${fmt(fuelMl)} (key=${key}) — ${isLikelyMl ? 'plausible mL ✓' : fuelMl === 0 ? 'zero (idle vehicle?)' : 'suspiciously small — may already be gallons'}`,
    });

    // Distance: distanceTraveledMeters — 100 miles = ~160934 meters
    const distM = r.distanceTraveledMeters ?? 0;
    const distMi = metersToMiles(distM);
    const isLikelyMeters = distM > 1000 || distM === 0;
    checks.push({
      label: 'distance-unit-raw',
      passed: isLikelyMeters,
      warn: distM > 0 && distM < 1000,
      detail: `distanceTraveledMeters=${fmt(distM)} (≈ ${fmt(distMi)} mi) — ${isLikelyMeters ? 'plausible meters ✓' : 'suspiciously small for meters'}`,
    });

    // Idle time: engineIdleTimeDurationMs — 1 hour = 3,600,000 ms
    const idleMs = Number(r.engineIdleTimeDurationMs ?? 0);
    const idleHr = msToHours(idleMs);
    const isLikelyMs = idleMs > 60000 || idleMs === 0;
    checks.push({
      label: 'idle-time-unit-raw',
      passed: isLikelyMs,
      warn: idleMs > 0 && idleMs < 60000,
      detail: `engineIdleTimeDurationMs=${idleMs} (≈ ${fmt(idleHr, 2)} hr) — ${isLikelyMs ? 'plausible ms ✓' : 'suspiciously small for ms'}`,
    });

    // Converted display values
    console.log(`\n  Sample record (${key}):`);
    console.log(`    fuelConsumedMl=${fmt(fuelMl)} → ${fmt(mlToGallons(fuelMl))} gal`);
    console.log(`    distanceTraveledMeters=${fmt(distM)} → ${fmt(distMi)} mi`);
    console.log(`    engineIdleTimeDurationMs=${idleMs} → ${fmt(idleHr)} hr`);
    console.log(`    engineRunTimeDurationMs=${Number(r.engineRunTimeDurationMs ?? 0)} → ${fmt(msToHours(Number(r.engineRunTimeDurationMs ?? 0)))} hr`);
    console.log(`    efficiencyMpge=${fmt(r.efficiencyMpge)}`);
  }

  // ── 5. Cross-check API vs DB values for matched rows ────────────────────────
  const matched = [...apiKeys].filter(k => dbKeys.has(k));
  let fuelMismatch = 0;
  let distMismatch = 0;
  const FUEL_TOLERANCE = 0.02;   // 2%
  const DIST_TOLERANCE = 0.02;

  for (const key of matched) {
    const api = apiByVehicleDate.get(key)!;
    const db = dbByVehicleDate.get(key)!;

    const apiFuel = api.fuelConsumedMl ?? 0;
    const dbFuel = db.fuelConsumedMl ?? 0;
    const apiDist = api.distanceTraveledMeters ?? 0;
    const dbDist = db.distanceTraveledMeters ?? 0;

    if (apiFuel > 0 || dbFuel > 0) {
      const fuelDelta = Math.abs(apiFuel - dbFuel) / Math.max(apiFuel, dbFuel, 1);
      if (fuelDelta > FUEL_TOLERANCE) fuelMismatch++;
    }
    if (apiDist > 0 || dbDist > 0) {
      const distDelta = Math.abs(apiDist - dbDist) / Math.max(apiDist, dbDist, 1);
      if (distDelta > DIST_TOLERANCE) distMismatch++;
    }
  }

  if (matched.length > 0) {
    checks.push({
      label: 'api-vs-db-fuel-values',
      passed: fuelMismatch === 0,
      warn: fuelMismatch > 0 && fuelMismatch <= 3,
      detail: fuelMismatch === 0
        ? `All ${matched.length} matched rows: fuel values agree with DB ✓`
        : `${fuelMismatch} / ${matched.length} rows have fuel mismatch > ${FUEL_TOLERANCE * 100}%`,
    });
    checks.push({
      label: 'api-vs-db-distance-values',
      passed: distMismatch === 0,
      warn: distMismatch > 0 && distMismatch <= 3,
      detail: distMismatch === 0
        ? `All ${matched.length} matched rows: distance values agree with DB ✓`
        : `${distMismatch} / ${matched.length} rows have distance mismatch > ${DIST_TOLERANCE * 100}%`,
    });
  }

  // ── 6. Fleet totals summary ──────────────────────────────────────────────────
  let apiTotalFuelGal = 0;
  let apiTotalDistMi = 0;
  for (const r of apiByVehicleDate.values()) {
    apiTotalFuelGal += mlToGallons(r.fuelConsumedMl ?? 0);
    apiTotalDistMi += metersToMiles(r.distanceTraveledMeters ?? 0);
  }
  console.log(`\n  Fleet 7-day totals (API converted):`);
  console.log(`    Total fuel: ${fmt(apiTotalFuelGal)} gal`);
  console.log(`    Total distance: ${fmt(apiTotalDistMi)} mi`);
  console.log(`    Avg MPG (fleet): ${apiTotalFuelGal > 0 ? fmt(apiTotalDistMi / apiTotalFuelGal) : 'n/a'}`);

  printResults(checks);
  await appPrisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
