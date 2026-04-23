/**
 * Daily EIA diesel price refresh — calls refreshDieselPrice() (writes system_config).
 * Schedule from Render or any cron; can run manually:
 *   pnpm exec tsx src/scripts/run-refresh-fuel-price.ts
 */
import { refreshDieselPrice } from '../lib/eiaFuelPrice.js';

async function main() {
  console.log(`[EIA] Diesel price refresh starting at ${new Date().toISOString()}`);
  const result = await refreshDieselPrice();
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
