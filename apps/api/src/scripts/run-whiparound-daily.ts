/**
 * Scheduled daily sync — runs syncWhiparoundDaily() across all active orgs.
 * Called by the Render cron job; can also be run manually:
 *   pnpm exec tsx src/scripts/run-whiparound-daily.ts
 */
import { syncWhiparoundDaily } from '../integrations/whiparound/syncService.js';

async function main() {
  console.log(`[WhipAround] Daily sync starting at ${new Date().toISOString()}`);
  const result = await syncWhiparoundDaily();
  console.log(JSON.stringify(result, null, 2));
  const exitCode = result.errorCount > 0 && result.successCount === 0 ? 1 : 0;
  process.exit(exitCode);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
