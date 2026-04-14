/**
 * ATLAS WHOLESALE — SAMSARA BACKFILL: February 2026
 * First month of Atlas's contract (2026-02-01).
 *
 * Run this script once to populate the initial month.
 * Safe to re-run — all writes are upserts. Dates within 3 days of today
 * automatically run in verify mode so near-current data is refreshed.
 *
 * Usage:
 *   pnpm exec tsx src/scripts/backfill/backfill-atlas-feb2026.ts
 *
 * To continue with subsequent months, use the generic backdate CLI:
 *   pnpm exec tsx src/telematics/samsara/backdate.ts \
 *     --org=org_39RQY3qNO861ScQb0ZLFSUIFZkN \
 *     --start=2026-03-01 --end=2026-03-31
 */

import 'dotenv/config';
import { backdateSamsaraData } from '../../telematics/samsara/backdate.js';

const ATLAS_ORG_ID = 'org_39RQY3qNO861ScQb0ZLFSUIFZkN';
const START_DATE   = '2026-02-01';
const END_DATE     = '2026-02-28';

console.log('Atlas Wholesale — Samsara first-month backfill');
console.log(`Range: ${START_DATE} → ${END_DATE}\n`);

backdateSamsaraData({ clerkOrgId: ATLAS_ORG_ID, startDate: START_DATE, endDate: END_DATE })
  .then(() => process.exit(0))
  .catch((err) => { console.error(err.message); process.exit(1); });
