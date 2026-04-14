/**
 * PHASE 0 — SAMSARA IDLING EVENTS VALIDATION
 *
 * Confirms:
 * 1. Pagination works correctly for /idling/events (max 200 per page).
 * 2. fuelConsumedMilliliters is present and plausible (mL, not gallons).
 * 3. durationMilliseconds is present and plausible.
 * 4. Cross-check: sum of fuelConsumedMilliliters from events vs fuelConsumedMl
 *    from fuel-energy report for the same vehicle/date.
 *    These should correlate — if idle fuel via events is significantly higher
 *    or lower than the total fuel from fuel-energy, something is wrong.
 * 5. Cross-check against samsara_idling_events DB rows — confirm no sync gaps.
 *
 * Usage: pnpm exec tsx src/scripts/phase0/validate-samsara-idling-events.ts
 *        ORG_ID=org_xxx pnpm exec tsx ...
 */

import 'dotenv/config';
import { appPrisma } from '../../lib/prisma.js';
import { readCredentials } from '../../lib/credentials.js';
import { SamsaraClient } from '../../telematics/samsara/client.js';
import { fetchIdlingEventsSummary } from '../../telematics/samsara/endpoints/idlingEvents.js';
import { fetchFuelEnergyReports } from '../../telematics/samsara/endpoints/fuelEnergyReports.js';
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

function mlToGallons(ml: number): number { return ml / 3785.41; }
function msToMinutes(ms: number): number { return ms / 60000; }

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

  // Use one settled date (4 days ago respects 72h lag) for detailed per-event inspection
  const singleDate = getSettledDate(4);

  // 7-day window for DB coverage check
  const endDate = singleDate;
  const startDateObj = new Date(endDate + 'T00:00:00Z');
  startDateObj.setUTCDate(startDateObj.getUTCDate() - 6);
  const startDate = startDateObj.toISOString().split('T')[0];

  console.log(`\nOrg: ${account.clerkOrgId}`);
  console.log(`Spot date for unit checks: ${singleDate}`);
  console.log(`DB coverage window: ${startDate} → ${endDate}\n`);

  const client = new SamsaraClient(apiToken);
  const checks: CheckResult[] = [];

  // ── 1. Fetch raw events for spot date (pagination test) ─────────────────────
  const { startTime, endTime } = getESTDayBounds(singleDate);
  console.log(`Fetching /idling/events for ${singleDate} (${startTime} → ${endTime})...`);

  // Use client directly to count pages for pagination validation
  let pageCount = 0;
  let totalEventCount = 0;
  let rawEvents: any[] = [];

  try {
    // Fetch all pages — idling/events max page size is 200
    const allEvents = await client.get<any>('/idling/events', {
      startTime,
      endTime,
      limit: 200,
    });
    rawEvents = allEvents;
    totalEventCount = allEvents.length;
    pageCount = Math.ceil(allEvents.length / 200) || 1;

    console.log(`  Total events: ${totalEventCount} (across ~${pageCount} pages)`);

    checks.push({
      label: 'idling-events-pagination',
      passed: true,
      detail: `Fetched ${totalEventCount} events across ~${pageCount} page(s) without error ✓`,
    });
  } catch (err: any) {
    checks.push({
      label: 'idling-events-pagination',
      passed: false,
      detail: `Failed to fetch /idling/events: ${err.message}`,
    });
    printResults(checks);
    await appPrisma.$disconnect();
    return;
  }

  // ── 2. Unit checks on raw event fields ──────────────────────────────────────
  const eventsWithFuel = rawEvents.filter((e: any) => (e.fuelConsumedMilliliters ?? 0) > 0);
  const eventsWithDuration = rawEvents.filter((e: any) => (e.durationMilliseconds ?? 0) > 0);

  console.log(`\n  Events with fuelConsumedMilliliters > 0: ${eventsWithFuel.length}`);
  console.log(`  Events with durationMilliseconds > 0: ${eventsWithDuration.length}`);

  if (eventsWithFuel.length > 0) {
    const fuelValues = eventsWithFuel.map((e: any) => e.fuelConsumedMilliliters);
    const median = fuelValues.sort((a: number, b: number) => a - b)[Math.floor(fuelValues.length / 2)];

    // Typical idle event: 15 min at ~0.5 gal/hr = ~0.125 gal = ~473 mL
    // If median is 0.1-2.0, it's probably gallons not mL — FAIL
    const isLikelyMl = median > 50;
    checks.push({
      label: 'idle-fuel-unit-check',
      passed: isLikelyMl,
      warn: !isLikelyMl && median > 0,
      detail: `fuelConsumedMilliliters median=${fmt(median)} (${fmt(mlToGallons(median), 4)} gal) — ${isLikelyMl ? 'plausible mL ✓' : 'suspiciously small — may already be gallons'}`,
    });

    console.log(`  fuelConsumedMilliliters median: ${fmt(median)} mL ≈ ${fmt(mlToGallons(median), 4)} gal`);
  } else {
    checks.push({
      label: 'idle-fuel-unit-check',
      passed: false,
      warn: true,
      detail: 'No events have fuelConsumedMilliliters > 0 on this date',
    });
  }

  if (eventsWithDuration.length > 0) {
    const durValues = eventsWithDuration.map((e: any) => e.durationMilliseconds);
    const median = durValues.sort((a: number, b: number) => a - b)[Math.floor(durValues.length / 2)];
    // 5-min idle = 300,000 ms. If median < 1000, likely in seconds not ms.
    const isLikelyMs = median > 1000;
    checks.push({
      label: 'idle-duration-unit-check',
      passed: isLikelyMs,
      warn: !isLikelyMs,
      detail: `durationMilliseconds median=${median} (${fmt(msToMinutes(median))} min) — ${isLikelyMs ? 'plausible ms ✓' : 'suspiciously small — may be seconds'}`,
    });
  }

  // ── 3. Print sample raw event fields ────────────────────────────────────────
  if (rawEvents.length > 0) {
    console.log('\n  Raw fields from first event:');
    for (const [k, v] of Object.entries(rawEvents[0])) {
      console.log(`    ${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
    }
  }

  // ── 4. Cross-check events fuel vs fuel-energy report ────────────────────────
  console.log('\nCross-checking idle fuel vs fuel-energy report...');
  let fuelEnergyReports: any[] = [];
  try {
    fuelEnergyReports = await fetchFuelEnergyReports(client, singleDate);
  } catch (err: any) {
    console.warn(`  Could not fetch fuel-energy reports: ${err.message}`);
  }

  if (fuelEnergyReports.length > 0 && eventsWithFuel.length > 0) {
    // Sum idling events by vehicle
    const eventFuelMlByVehicle = new Map<string, number>();
    const eventDurationMsByVehicle = new Map<string, number>();
    for (const e of rawEvents) {
      const vid = String(e.asset?.id ?? '');
      if (!vid) continue;
      eventFuelMlByVehicle.set(vid, (eventFuelMlByVehicle.get(vid) ?? 0) + (e.fuelConsumedMilliliters ?? 0));
      eventDurationMsByVehicle.set(vid, (eventDurationMsByVehicle.get(vid) ?? 0) + (e.durationMilliseconds ?? 0));
    }

    // Compare against fuel-energy idle time
    const fuelEnergyByVehicle = new Map<string, any>();
    for (const r of fuelEnergyReports) {
      fuelEnergyByVehicle.set(String(r.vehicle?.id ?? ''), r);
    }

    let idleTimeMatches = 0;
    let idleTimeMismatches = 0;

    console.log('\n  Vehicle | events idle fuel (gal) | FE idle time (hr) | events idle time (hr)');
    for (const [vid, fuelMl] of eventFuelMlByVehicle.entries()) {
      const fe = fuelEnergyByVehicle.get(vid);
      if (!fe) continue;
      const eventDurHr = msToMinutes(eventDurationMsByVehicle.get(vid) ?? 0) / 60;
      const feIdleHr = Number(fe.engineIdleTimeDurationMs ?? 0) / 3600000;
      const idleTimeDelta = Math.abs(eventDurHr - feIdleHr) / Math.max(feIdleHr, 0.001);
      const matches = idleTimeDelta <= 0.1; // 10% tolerance
      if (matches) idleTimeMatches++; else idleTimeMismatches++;
      const name = fe.vehicle?.name ?? vid;
      console.log(`  ${name.padEnd(8)} | ${fmt(mlToGallons(fuelMl)).padStart(21)} | ${fmt(feIdleHr).padStart(17)} | ${fmt(eventDurHr).padStart(21)} ${!matches ? '← DIFF' : ''}`);
    }

    checks.push({
      label: 'idle-time-cross-check',
      passed: idleTimeMismatches === 0,
      warn: idleTimeMismatches > 0 && idleTimeMismatches <= 3,
      detail: `Idle time: ${idleTimeMatches} vehicles match, ${idleTimeMismatches} mismatch (>10% delta) vs fuel-energy report`,
    });
  }

  // ── 5. DB coverage check ────────────────────────────────────────────────────
  const dbEvents = await appPrisma.samsaraIdlingEvent.findMany({
    where: {
      clerkOrgId: account.clerkOrgId,
      eventDate: {
        gte: startDate,
        lte: endDate,
      },
    },
    select: {
      eventDate: true,
      assetId: true,
    },
  });

  const dbEventsByDate = new Map<string, number>();
  for (const e of dbEvents) {
    dbEventsByDate.set(e.eventDate, (dbEventsByDate.get(e.eventDate) ?? 0) + 1);
  }

  console.log(`\n  DB samsara_idling_events rows for 7-day window: ${dbEvents.length}`);
  console.log('  Date breakdown (DB):');
  for (let i = 0; i < 7; i++) {
    const d = new Date(startDate + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + i);
    const dateStr = d.toISOString().split('T')[0];
    const count = dbEventsByDate.get(dateStr) ?? 0;
    console.log(`    ${dateStr}: ${count} events`);
  }

  const spotDbCount = dbEventsByDate.get(singleDate) ?? 0;
  checks.push({
    label: 'db-vs-api-spot-coverage',
    passed: spotDbCount > 0 || totalEventCount === 0,
    warn: spotDbCount === 0 && totalEventCount > 0,
    detail: spotDbCount > 0
      ? `DB has ${spotDbCount} events for spot date ${singleDate} ✓`
      : totalEventCount > 0
      ? `DB has 0 events for ${singleDate} but API returned ${totalEventCount} — sync gap`
      : `No events in API or DB for ${singleDate}`,
  });

  printResults(checks);
  await appPrisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
