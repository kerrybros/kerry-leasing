/**
 * VERIFY: end-to-end Samsara driver scorecard
 *
 * Calls TelematicsService.getDriverScorecard() directly for a Samsara org and
 * prints the resulting ScorecardDriver[]. Exercises the full backend path
 * (provider resolution → samsara_driver_fuel_energy → samsara_safety_events
 * mapping → behaviorLabelMap → safetyScore math → final ranked output).
 *
 * No HTTP, no auth — service layer only. Catches everything except UI rendering.
 *
 * Usage:
 *   pnpm exec tsx src/scripts/verify-samsara-scorecard.ts \
 *     [orgId] [startDate] [endDate]
 *   Defaults: org_39RQY3qNO861ScQb0ZLFSUIFZkN, 2026-04-01 → 2026-04-30
 */

import 'dotenv/config';
import { appPrisma } from '../lib/prisma.js';
import { TelematicsService } from '../services/telematicsService.js';

const orgId = process.argv[2] || 'org_39RQY3qNO861ScQb0ZLFSUIFZkN';
const startDate = process.argv[3] || '2026-04-01';
const endDate = process.argv[4] || '2026-04-30';

async function main() {
  const svc = new TelematicsService();
  console.log(`\n--- Samsara scorecard verification ---`);
  console.log(`Org:    ${orgId}`);
  console.log(`Period: ${startDate} → ${endDate}\n`);

  const start = Date.now();
  const result = await svc.getDriverScorecard(orgId, startDate, endDate);
  const elapsedMs = Date.now() - start;

  console.log(`Provider:       ${result.provider}`);
  console.log(`Fleet avg MPG:  ${result.fleetAvgMpg}`);
  console.log(`Driver count:   ${result.data.length}`);
  console.log(`Compute time:   ${elapsedMs}ms\n`);

  if (result.data.length === 0) {
    console.log(`(empty result)`);
    return;
  }

  // Print top + bottom of the ranked list
  const printRow = (d: typeof result.data[0]) => {
    console.log(
      `  #${String(d.rank ?? '?').padStart(2)}  ${d.driverName.padEnd(28)} ` +
      `score=${String(d.score).padStart(3)} (${d.grade})  ` +
      `miles=${String(d.totalMiles).padStart(7)}  mpg=${String(d.avgMpg).padStart(5)}  ` +
      `idle%=${String(d.idlePct).padStart(4)}  events=${d.hardEvents}  ` +
      `sub[idle=${d.subScores.idle},mpg=${d.subScores.mpg},safety=${d.subScores.safety}]`
    );
  };

  console.log(`TOP 5 by score:`);
  result.data.slice(0, 5).forEach(printRow);

  if (result.data.length > 5) {
    console.log(`\nBOTTOM 3 by score:`);
    result.data.slice(-3).forEach(printRow);
  }

  // Sanity assertions
  console.log(`\n--- Sanity checks ---`);
  const anyWithMiles = result.data.some(d => d.totalMiles > 0);
  const anyWithFuel = result.data.some(d => d.totalFuelGal > 0);
  const allScored = result.data.every(d => d.score >= 0 && d.score <= 100);
  const allHaveNames = result.data.every(d => d.driverName && d.driverName.length > 0);
  const sortedDescByScore = result.data.every(
    (d, i, arr) => i === 0 || d.score <= arr[i - 1]!.score
  );
  const ranksAssigned = result.data.every((d, i) => d.rank === i + 1);

  const check = (label: string, ok: boolean) =>
    console.log(`  ${ok ? '✓' : '✗'} ${label}`);

  check('At least one driver has miles > 0', anyWithMiles);
  check('At least one driver has fuel > 0', anyWithFuel);
  check('All scores in [0, 100]', allScored);
  check('All drivers have a display name', allHaveNames);
  check('Result sorted descending by score', sortedDescByScore);
  check('Ranks assigned 1..N in order', ranksAssigned);

  const failed =
    !anyWithMiles || !anyWithFuel || !allScored || !allHaveNames ||
    !sortedDescByScore || !ranksAssigned;
  if (failed) {
    process.exitCode = 1;
    console.log(`\n❌ One or more sanity checks failed.`);
  } else {
    console.log(`\n✅ All sanity checks passed.`);
  }
}

main()
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await appPrisma.$disconnect();
  });
