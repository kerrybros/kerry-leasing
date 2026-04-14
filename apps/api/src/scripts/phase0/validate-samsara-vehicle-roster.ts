/**
 * PHASE 0 — SAMSARA VEHICLE ROSTER VALIDATION
 *
 * Confirms:
 * 1. GET /fleet/vehicles returns all active vehicles including:
 *    - id (Samsara vehicle ID — used in fuel-energy + idling events)
 *    - name (vehicle number / unit label)
 *    - vin
 *    - make, model, year
 *    - licensePlate
 * 2. Cross-references vehicles against telematics_vehicle_maps (our DB).
 *    - Flags vehicles in API but missing from DB (need to be synced)
 *    - Flags vehicles in DB but not in API (decommissioned?)
 *    - Flags VIN mismatches
 * 3. Cross-references vehicle IDs against samsara_raw_data to verify
 *    fuel-energy sync covers all active vehicles.
 *
 * Usage: pnpm exec tsx src/scripts/phase0/validate-samsara-vehicle-roster.ts
 *        ORG_ID=org_xxx pnpm exec tsx ...
 */

import 'dotenv/config';
import { appPrisma } from '../../lib/prisma.js';
import { readCredentials } from '../../lib/credentials.js';
import { SamsaraClient } from '../../telematics/samsara/client.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SamsaraVehicle {
  id: string;
  name?: string;
  vin?: string;
  make?: string;
  model?: string;
  year?: number;
  licensePlate?: string;
  serial?: string;
  tags?: Array<{ id: string; name: string }>;
  externalIds?: Record<string, string>;
  staticAssignedDriver?: { id: string; name: string } | null;
  [key: string]: unknown;
}

interface CheckResult {
  label: string;
  passed: boolean;
  warn?: boolean;
  detail: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

  console.log(`\nOrg: ${account.clerkOrgId}\n`);

  const client = new SamsaraClient(apiToken);
  const checks: CheckResult[] = [];

  // ── 1. Fetch full vehicle roster from API ────────────────────────────────────
  console.log('Fetching /fleet/vehicles...');
  let vehicles: SamsaraVehicle[] = [];

  try {
    vehicles = await client.get<SamsaraVehicle>('/fleet/vehicles');
    console.log(`  Returned ${vehicles.length} vehicles`);
    checks.push({
      label: 'roster-endpoint',
      passed: vehicles.length > 0,
      detail: `/fleet/vehicles returned ${vehicles.length} vehicles`,
    });
  } catch (err: any) {
    checks.push({
      label: 'roster-endpoint',
      passed: false,
      detail: `/fleet/vehicles failed: ${err.message}`,
    });
    printResults(checks);
    await appPrisma.$disconnect();
    return;
  }

  // ── 2. Field presence analysis ──────────────────────────────────────────────
  const withVin = vehicles.filter(v => v.vin && v.vin.length > 5).length;
  const withMake = vehicles.filter(v => v.make).length;
  const withModel = vehicles.filter(v => v.model).length;
  const withYear = vehicles.filter(v => v.year).length;
  const withPlate = vehicles.filter(v => v.licensePlate).length;
  const withName = vehicles.filter(v => v.name).length;

  console.log('\n  Field coverage:');
  console.log(`    id:           ${vehicles.length} / ${vehicles.length} (required)`);
  console.log(`    name:         ${withName} / ${vehicles.length}`);
  console.log(`    vin:          ${withVin} / ${vehicles.length}`);
  console.log(`    make:         ${withMake} / ${vehicles.length}`);
  console.log(`    model:        ${withModel} / ${vehicles.length}`);
  console.log(`    year:         ${withYear} / ${vehicles.length}`);
  console.log(`    licensePlate: ${withPlate} / ${vehicles.length}`);

  checks.push({
    label: 'vin-coverage',
    passed: withVin >= Math.ceil(vehicles.length * 0.8),
    warn: withVin > 0 && withVin < Math.ceil(vehicles.length * 0.8),
    detail: `VIN present on ${withVin} / ${vehicles.length} vehicles (${((withVin / vehicles.length) * 100).toFixed(0)}%)`,
  });

  // ── 3. Cross-reference against telematics_vehicle_maps ──────────────────────
  const dbMaps = await appPrisma.telematicsVehicleMap.findMany({
    where: {
      clerkOrgId: account.clerkOrgId,
      provider: 'SAMSARA',
    },
    select: {
      vin: true,
      providerVehicleId: true,
      providerVehicleName: true,
    },
  });

  console.log(`\n  telematics_vehicle_maps: ${dbMaps.length} SAMSARA entries for this org`);

  const apiIds = new Set(vehicles.map(v => v.id));
  const dbIds = new Set(dbMaps.map(r => r.providerVehicleId));
  const apiVins = new Map(vehicles.filter(v => v.vin).map(v => [v.id, v.vin!]));
  const dbVins = new Map(dbMaps.map(r => [r.providerVehicleId, r.vin]));

  const inApiNotDb = [...apiIds].filter(id => !dbIds.has(id));
  const inDbNotApi = [...dbIds].filter(id => !apiIds.has(id));
  const vinMismatches: string[] = [];

  for (const [id, apiVin] of apiVins.entries()) {
    const dbVin = dbVins.get(id);
    if (dbVin && dbVin !== apiVin) {
      vinMismatches.push(`vehicle ${id}: DB VIN=${dbVin}, API VIN=${apiVin}`);
    }
  }

  console.log(`  In API, not in DB: ${inApiNotDb.length} vehicles`);
  if (inApiNotDb.length > 0 && inApiNotDb.length <= 20) {
    inApiNotDb.forEach(id => {
      const v = vehicles.find(vv => vv.id === id);
      console.log(`    Missing: id=${id}, name=${v?.name ?? '?'}, VIN=${v?.vin ?? '?'}`);
    });
  }

  console.log(`  In DB, not in API: ${inDbNotApi.length} vehicles`);
  if (inDbNotApi.length > 0) {
    inDbNotApi.forEach(id => {
      const r = dbMaps.find(m => m.providerVehicleId === id);
      console.log(`    Stale: id=${id}, name=${r?.providerVehicleName ?? '?'}, VIN=${r?.vin ?? '?'}`);
    });
  }

  console.log(`  VIN mismatches: ${vinMismatches.length}`);
  vinMismatches.forEach(m => console.log(`    ⚠ ${m}`));

  checks.push({
    label: 'roster-vs-db-coverage',
    passed: inApiNotDb.length === 0,
    warn: inApiNotDb.length > 0,
    detail: inApiNotDb.length === 0
      ? `All ${vehicles.length} API vehicles present in telematics_vehicle_maps ✓`
      : `${inApiNotDb.length} vehicles in API missing from DB — need syncSamsaraVehicles`,
  });

  checks.push({
    label: 'vin-mismatches',
    passed: vinMismatches.length === 0,
    warn: vinMismatches.length > 0,
    detail: vinMismatches.length === 0
      ? 'No VIN mismatches between API and DB ✓'
      : `${vinMismatches.length} VIN mismatch(es) — DB needs update`,
  });

  // ── 4. Cross-reference vehicle IDs against samsara_raw_data ─────────────────
  // Check last 7 settled days
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - 4);
  const cutoffDate = cutoff.toISOString().split('T')[0];
  const weekAgo = new Date(cutoff);
  weekAgo.setUTCDate(weekAgo.getUTCDate() - 6);
  const weekAgoDate = weekAgo.toISOString().split('T')[0];

  const rawDataVehicleIds = await appPrisma.samsaraRawData.findMany({
    where: {
      clerkOrgId: account.clerkOrgId,
      date: { gte: weekAgoDate, lte: cutoffDate },
    },
    select: { vehicleId: true },
    distinct: ['vehicleId'],
  });

  const syncedIds = new Set(rawDataVehicleIds.map(r => r.vehicleId));
  const inApiNotSynced = [...apiIds].filter(id => !syncedIds.has(id));
  const syncedButNotInApi = [...syncedIds].filter(id => !apiIds.has(id));

  console.log(`\n  samsara_raw_data: ${syncedIds.size} unique vehicle IDs synced in last 7 settled days`);
  console.log(`  In API but NOT synced: ${inApiNotSynced.length}`);
  if (inApiNotSynced.length > 0 && inApiNotSynced.length <= 20) {
    inApiNotSynced.forEach(id => {
      const v = vehicles.find(vv => vv.id === id);
      console.log(`    Not synced: id=${id}, name=${v?.name ?? '?'}`);
    });
  }

  checks.push({
    label: 'fuel-energy-sync-coverage',
    passed: inApiNotSynced.length === 0,
    warn: inApiNotSynced.length > 0,
    detail: inApiNotSynced.length === 0
      ? `All API vehicles have samsara_raw_data rows in last 7 settled days ✓`
      : `${inApiNotSynced.length} API vehicles have no synced data — possible inactive vehicles or sync gap`,
  });

  // ── 5. Print full roster table ───────────────────────────────────────────────
  console.log('\n  Full vehicle roster from API:');
  console.log('  ID                        | Name                 | VIN               | Make         | Model        | Year | Plate');
  console.log('  ' + '─'.repeat(115));
  for (const v of vehicles) {
    console.log(
      `  ${v.id.padEnd(26)} | ${(v.name ?? '─').padEnd(20)} | ${(v.vin ?? '─').padEnd(17)} | ${(v.make ?? '─').padEnd(12)} | ${(v.model ?? '─').padEnd(12)} | ${String(v.year ?? '─').padStart(4)} | ${v.licensePlate ?? '─'}`
    );
  }

  // ── 6. Print raw fields from sample record ───────────────────────────────────
  if (vehicles.length > 0) {
    console.log('\n  Raw top-level keys from first vehicle:');
    for (const [k, v] of Object.entries(vehicles[0])) {
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
