/**
 * WOLVERINE PACKING — MOTIVE BACKFILL: May 2025
 * Starting from May 2025 — the first month with meaningful fleet utilization.
 * (March/April 2025 had minimal activity, only ~2 units running.)
 *
 * Run this script once to populate the initial month.
 * Safe to re-run — all writes are upserts. Dates within 2 days of today
 * automatically run in verify mode so near-current data is refreshed.
 *
 * Expect this to take ~15–20 minutes (31 days × ~30s per day).
 *
 * Usage:
 *   pnpm exec tsx src/scripts/backfill/backfill-wolverine-mar2025.ts
 *
 * To continue with subsequent months, use the generic backdate CLI:
 *   pnpm exec tsx src/telematics/motive/backdate.ts \
 *     --org=org_39B7lu1b8YKds8IOtzrk6LpKnLW \
 *     --start=2025-06-01 --end=2025-06-30
 */

import 'dotenv/config';
import { backdateMotiveData } from '../../telematics/motive/backdate.js';

const WOLVERINE_ORG_ID = 'org_39B7lu1b8YKds8IOtzrk6LpKnLW';
const START_DATE       = '2025-05-01';
const END_DATE         = '2025-05-31';

console.log('Wolverine Packing — Motive May 2025 backfill');
console.log(`Range: ${START_DATE} → ${END_DATE}\n`);

backdateMotiveData({ clerkOrgId: WOLVERINE_ORG_ID, startDate: START_DATE, endDate: END_DATE })
  .then(() => process.exit(0))
  .catch((err) => { console.error(err.message); process.exit(1); });
