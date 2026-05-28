/**
 * Probe an org's Samsara API token by hitting one endpoint per scope.
 * Each endpoint requires a different scope; a 401 tells us a scope is missing.
 *
 * Usage: pnpm exec tsx src/scripts/probe-samsara-scopes.ts <orgId>
 */

import 'dotenv/config';
import { appPrisma } from '../lib/prisma.js';
import { readCredentials } from '../lib/credentials.js';
import { SamsaraClient } from '../telematics/samsara/client.js';
import { getESTDayBounds } from '../telematics/dates.js';

const orgId = process.argv[2];
if (!orgId) { console.error('Usage: probe-samsara-scopes.ts <orgId>'); process.exit(1); }

async function probe(label: string, fn: () => Promise<any>) {
  try {
    const out = await fn();
    const n = Array.isArray(out) ? out.length : Object.keys(out || {}).length;
    console.log(`  ✓ ${label.padEnd(36)} OK (${n} items returned)`);
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    if (msg.includes('401') || err?.name === 'TelematicsAuthError') {
      console.log(`  ✗ ${label.padEnd(36)} 401 — scope missing`);
    } else {
      console.log(`  ? ${label.padEnd(36)} ERROR: ${msg.slice(0, 80)}`);
    }
  }
}

async function main() {
  const account = await appPrisma.telematicsProviderAccount.findUnique({
    where: { clerkOrgId: orgId },
  });
  if (!account || account.provider !== 'SAMSARA') {
    console.error(`No Samsara account for ${orgId}`); process.exit(1);
  }
  const token = readCredentials(account.credentialsJson).apiToken as string;
  const client = new SamsaraClient(token);
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]!;
  const { startTime, endTime } = getESTDayBounds(yesterday);

  console.log(`\nProbing scopes for ${orgId} (window: ${yesterday})\n`);

  await probe('Read Vehicles (vehicles list)', () =>
    client.get('/fleet/vehicles', { limit: 1 })
  );
  await probe('Read Fuel & Energy (vehicle reports)', () =>
    client.getSinglePage('/fleet/reports/vehicles/fuel-energy', { startDate: yesterday, endDate: yesterday, energyType: 'fuel' })
  );
  await probe('Read Fuel & Energy (idling events)', () =>
    client.get('/idling/events', { startTime, endTime, limit: 1 })
  );
  await probe('Read Fuel & Energy (driver reports)', () =>
    client.getSinglePage('/fleet/reports/drivers/fuel-energy', { startDate: yesterday, endDate: yesterday })
  );
  await probe('Read Geofences/Addresses', () =>
    client.get('/addresses', { limit: 1 })
  );
  await probe('Read Drivers', () =>
    client.get('/fleet/drivers', { limit: 1 })
  );
  await probe('Read Safety Events & Scores (events)', () =>
    client.get('/fleet/safety-events', { startTime, endTime, limit: 1 })
  );
  await probe('Read Safety Events & Scores (scores)', () =>
    client.get('/safety-scores/drivers', { startTime, endTime })
  );

  console.log('');
}

main().catch(err => { console.error(err); process.exit(1); }).finally(() => appPrisma.$disconnect());
