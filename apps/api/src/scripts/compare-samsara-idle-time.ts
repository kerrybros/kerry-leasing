/**
 * COMPARE SAMSARA IDLE TIME: FUEL-ENERGY vs IDLING EVENTS
 *
 * Both endpoints are pulled per day with the same date convention:
 *   - Day bounds: dateT00:00:00Z to dateT23:59:59Z (UTC)
 *   - Stored date: YYYY-MM-DD
 *
 * This script fetches 2–3 dates from both APIs and compares:
 *   - Fuel-energy: engineIdleTimeDurationMs (one value per vehicle per day)
 *   - Idling events: sum of durationMilliseconds per vehicle per day
 *
 * They should match for the same vehicle on the same day if we're aligned.
 *
 * Usage:
 *   pnpm tsx src/scripts/compare-samsara-idle-time.ts --org=org_xxxxx
 *   (defaults to Atlas org if --org omitted)
 */

import 'dotenv/config';
import { appPrisma } from '../lib/prisma.js';
import { SamsaraClient } from '../telematics/samsara/client.js';
import { fetchFuelEnergyReports } from '../telematics/samsara/endpoints/fuelEnergyReports.js';
import { fetchIdlingEventsSummary } from '../telematics/samsara/endpoints/idlingEvents.js';
import { getESTDayBounds, getYesterday, getTwoDaysAgo, getThreeDaysAgo } from '../telematics/dates.js';

const DEFAULT_ORG = 'org_39RQY3qNO861ScQb0ZLFSUIFZkN'; // Atlas

function parseArgs(): { orgId: string; date?: string } {
  const args = process.argv.slice(2);
  let orgId = DEFAULT_ORG;
  let date: string | undefined;
  for (const arg of args) {
    if (arg.startsWith('--org=')) {
      orgId = arg.split('=')[1];
    } else if (arg.startsWith('--date=')) {
      date = arg.split('=')[1];
    }
  }
  return { orgId, date };
}

function msToMinutes(ms: number): string {
  return (ms / 60000).toFixed(1);
}

async function main() {
  const { orgId, date: singleDate } = parseArgs();

  const account = await appPrisma.telematicsProviderAccount.findUnique({
    where: { clerkOrgId: orgId, provider: 'SAMSARA' },
  });

  if (!account) {
    console.error(`No Samsara account found for org ${orgId}`);
    process.exit(1);
  }

  const apiToken = (account.credentialsJson as any).apiToken;
  if (!apiToken) {
    console.error('No API token in credentials');
    process.exit(1);
  }

  const client = new SamsaraClient(apiToken);
  const dates = singleDate
    ? [singleDate]
    : [getYesterday(), getTwoDaysAgo(), getThreeDaysAgo()];

  console.log('\n=== Samsara idle time comparison (fuel-energy vs idling events) ===\n');
  console.log('Date convention: full calendar day in EST (America/New_York), same bounds for both APIs');
  console.log('  startTime/endTime = getESTDayBounds(date)\n');
  console.log(`Dates: ${dates.join(', ')}\n`);

  for (const date of dates) {
    const { startTime, endTime } = getESTDayBounds(date);

    const [reports, idlingSummary] = await Promise.all([
      fetchFuelEnergyReports(client, date),
      fetchIdlingEventsSummary(client, startTime, endTime),
    ]);

    const { durationMsByVehicle: idlingMsByVehicle } = idlingSummary;

    console.log(`\n--- ${date} ---`);
    if (reports.length === 0) {
      console.log('  No fuel-energy reports.');
      continue;
    }

    const rows: Array<{
      vehicleId: string;
      name: string;
      fuelEnergyMs: number;
      idlingSumMs: number;
      diffMs: number;
      match: boolean;
    }> = [];

    for (const r of reports) {
      const vehicleId = r.vehicle.id;
      const fuelEnergyMs = r.engineIdleTimeDurationMs ?? 0;
      const idlingSumMs = idlingMsByVehicle.get(vehicleId) ?? 0;
      const diffMs = Math.abs(fuelEnergyMs - idlingSumMs);
      const match = diffMs < 2000 || (fuelEnergyMs > 0 && diffMs / fuelEnergyMs < 0.02);

      rows.push({
        vehicleId,
        name: r.vehicle.name ?? vehicleId,
        fuelEnergyMs,
        idlingSumMs,
        diffMs,
        match,
      });
    }

    // Sort by diff descending to show largest mismatches first
    rows.sort((a, b) => b.diffMs - a.diffMs);

    console.log(`  Vehicles: ${rows.length}`);
    console.log('');
    console.log('  Vehicle ID   | Name (trunc)   | Fuel-Energy (idle ms) | Idling events (sum ms) | Diff (ms) | Match?');
    console.log('  ------------|----------------|------------------------|-------------------------|-----------|--------');

    for (const row of rows) {
      const name = row.name.slice(0, 14).padEnd(14);
      const matchStr = row.match ? 'yes' : 'NO';
      console.log(
        `  ${row.vehicleId.padEnd(12)} | ${name} | ${String(row.fuelEnergyMs).padStart(22)} | ${String(row.idlingSumMs).padStart(23)} | ${String(row.diffMs).padStart(9)} | ${matchStr}`
      );
    }

    const matched = rows.filter((r) => r.match).length;
    const total = rows.length;
    console.log('');
    console.log(`  Summary: ${matched}/${total} vehicles within tolerance (diff < 2s or < 2% of fuel-energy idle).`);
  }

  console.log('\n=== Done ===\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
