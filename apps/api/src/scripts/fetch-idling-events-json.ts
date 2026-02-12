/**
 * Fetch idling events for a single day and write raw JSON to a file for inspection.
 *
 * Usage:
 *   pnpm tsx src/scripts/fetch-idling-events-json.ts [date]
 *   Default date: 2026-02-01
 *
 * Output: scripts/output/idling-events-YYYY-MM-DD.json (raw API response)
 */

import 'dotenv/config';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import axios from 'axios';
import { appPrisma } from '../lib/prisma.js';
import { getESTDayBounds } from '../telematics/dates.js';

const DEFAULT_DATE = '2026-02-01';
const ATLAS_ORG = 'org_39RQY3qNO861ScQb0ZLFSUIFZkN';

async function main() {
  const date = process.argv[2] || DEFAULT_DATE;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    console.error('Date must be YYYY-MM-DD');
    process.exit(1);
  }

  const account = await appPrisma.telematicsProviderAccount.findUnique({
    where: { clerkOrgId: ATLAS_ORG, provider: 'SAMSARA' },
  });
  if (!account) {
    console.error('No Samsara account for Atlas org');
    process.exit(1);
  }
  const apiToken = (account.credentialsJson as any).apiToken;
  if (!apiToken) {
    console.error('No API token');
    process.exit(1);
  }

  const { startTime, endTime } = getESTDayBounds(date);

  console.log(`Fetching idling events for ${date} EST (${startTime} to ${endTime})...`);

  const response = await axios.get('https://api.samsara.com/idling/events', {
    params: { startTime, endTime, limit: 200 },
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
  });

  const raw = response.data;
  const eventCount = Array.isArray(raw?.data) ? raw.data.length : raw?.data ? 'object' : 0;
  console.log(`Raw response keys: ${Object.keys(raw || {}).join(', ')}`);
  console.log(`Event count (data array): ${eventCount}`);

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const outDir = join(__dirname, 'output');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `idling-events-${date}.json`);
  writeFileSync(outPath, JSON.stringify(raw, null, 2), 'utf-8');

  console.log(`Written to ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
