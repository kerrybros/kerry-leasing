/**
 * Fill empty driver-contact phone numbers from Motive's user roster.
 *
 * Whiparound stays authoritative; this only touches contacts with NO phone.
 * Adding a number does not make anyone reachable on its own: SMS still requires
 * a confirmed opt-in, so a filled contact stays NO_CONSENT until they reply YES.
 *
 *   pnpm exec tsx src/scripts/backfill-driver-phones-from-motive.ts --org=<clerkOrgId>          # dry run
 *   pnpm exec tsx src/scripts/backfill-driver-phones-from-motive.ts --org=<clerkOrgId> --apply
 */
import { getAppPrisma } from '../lib/prisma.js';
import { fillMissingPhonesFromMotive } from '../features/drivers/motivePhoneFallback.js';

async function main() {
  const org = process.argv.find((a) => a.startsWith('--org='))?.split('=')[1];
  const apply = process.argv.includes('--apply');
  if (!org) throw new Error('--org=<clerkOrgId> required');

  const r = await fillMissingPhonesFromMotive(getAppPrisma(), org, { apply });
  const mask = (p: string) => `${p.slice(0, 2)}${'*'.repeat(Math.max(0, p.length - 6))}${p.slice(-4)}`;

  console.log(apply ? '\nAPPLIED:' : '\nDRY RUN, nothing written:');
  if (r.filled.length === 0) console.log('  no contact needed a phone from Motive');
  for (const f of r.filled) console.log(`  ${f.displayName.padEnd(26)} <- ${mask(f.phoneE164)}  (Motive driver ${f.motiveDriverId})`);
  if (r.stillMissing.length) {
    console.log('\nStill without a phone:');
    for (const m of r.stillMissing) console.log(`  ${m.displayName.padEnd(26)} ${m.reason}`);
  }
  if (!apply && r.filled.length) console.log('\nRe-run with --apply to write these.');
  process.exit(0);
}
main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
