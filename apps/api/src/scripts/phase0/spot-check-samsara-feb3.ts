/**
 * Samsara Feb 3 dashboard spot-check.
 * Pulls fuel-energy reports for 2026-02-03 and prints a CSV-style table.
 * Compare the output against the Samsara web dashboard for that day.
 *
 * Usage: pnpm exec tsx src/scripts/phase0/spot-check-samsara-feb3.ts
 */

import 'dotenv/config';
import { appPrisma } from '../../lib/prisma.js';
import { SamsaraClient } from '../../telematics/samsara/client.js';
import { fetchFuelEnergyReports, SamsaraConversions } from '../../telematics/samsara/endpoints/fuelEnergyReports.js';
import { readCredentials } from '../../lib/credentials.js';

const DATE = '2026-02-03';

async function main() {
  const account = await appPrisma.telematicsProviderAccount.findFirst({
    where: { provider: 'SAMSARA', status: 'ACTIVE' },
  });
  if (!account) {
    console.error('No active Samsara account found in DB');
    process.exit(1);
  }

  const creds = readCredentials(account.credentialsJson);
  const apiToken = creds.apiToken as string | undefined;
  if (!apiToken) {
    console.error('Samsara account has no apiToken in credentialsJson');
    process.exit(1);
  }

  const client = new SamsaraClient(apiToken);
  const reports = await fetchFuelEnergyReports(client, DATE);

  if (reports.length === 0) {
    console.warn('\nNo Samsara vehicle reports returned for', DATE);
    process.exit(0);
  }

  // Print per-vehicle table
  console.log('\n--- Samsara Fuel-Energy Spot-Check for', DATE, '---\n');
  const header = [
    'Vehicle',
    'Fuel (gal)',
    'Distance (mi)',
    'Drive Time (min)',
    'Idle Time (min)',
    'MPG',
  ].join('\t');
  console.log(header);
  console.log('-'.repeat(80));

  let totalFuelGal = 0;
  let totalDistMiles = 0;
  let totalDriveMin = 0;
  let totalIdleMin = 0;

  for (const r of reports) {
    const name = r.vehicle.name;
    const fuelGal = SamsaraConversions.millilitersToGallons(r.fuelConsumedMl);
    const distMiles = SamsaraConversions.metersToMiles(r.distanceTraveledMeters);
    const driveMin = SamsaraConversions.millisecondsToMinutes(
      r.engineRunTimeDurationMs - r.engineIdleTimeDurationMs
    );
    const idleMin = SamsaraConversions.millisecondsToMinutes(r.engineIdleTimeDurationMs);
    const mpg = fuelGal > 0 ? distMiles / fuelGal : null;

    totalFuelGal += fuelGal;
    totalDistMiles += distMiles;
    totalDriveMin += driveMin;
    totalIdleMin += idleMin;

    const row = [
      name,
      fuelGal.toFixed(3),
      distMiles.toFixed(2),
      driveMin.toFixed(1),
      idleMin.toFixed(1),
      mpg !== null ? mpg.toFixed(2) : 'N/A',
    ].join('\t');
    console.log(row);
  }

  console.log('-'.repeat(80));
  const fleetMpg = totalFuelGal > 0 ? totalDistMiles / totalFuelGal : null;
  console.log(
    [
      'FLEET TOTAL',
      totalFuelGal.toFixed(3),
      totalDistMiles.toFixed(2),
      totalDriveMin.toFixed(1),
      totalIdleMin.toFixed(1),
      fleetMpg !== null ? fleetMpg.toFixed(2) : 'N/A',
    ].join('\t')
  );
  console.log('\nTotal vehicles:', reports.length);
  console.log('\nCompare these fleet totals against your Samsara dashboard for', DATE);
  console.log('Go/No-Go gate: within ~2% on fuel and distance = proceed to build.\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
