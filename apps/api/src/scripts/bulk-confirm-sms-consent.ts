/**
 * BULK-CONFIRM SMS CONSENT (admin operation)
 *
 * Marks rostered drivers as smsConsentStatus=CONFIRMED without the per-driver
 * YES reply, on the basis of the written SMS sign-up form each driver signs at
 * enrollment (https://www.kerryleasing.com/sms-consent-form.pdf).
 *
 * IMPORTANT — audit integrity: this does NOT write smsConsentReplyBody or
 * smsConsentReplySid. Those fields mean "the driver texted us back" and must
 * stay null when that never happened. The basis of consent is recorded honestly
 * in smsConsentMethod so the trail shows exactly how consent was established.
 *
 * Note this is a deliberate departure from the DOUBLE_OPT_IN_SMS flow described
 * in the registered A2P campaign (CRDNPE0), whose message_flow tells reviewers
 * that only numbers replying YES are messaged. Use only with the signed forms
 * actually on file.
 *
 * Usage:
 *   pnpm exec tsx src/scripts/bulk-confirm-sms-consent.ts --org=<clerkOrgId>            # dry run
 *   pnpm exec tsx src/scripts/bulk-confirm-sms-consent.ts --org=<clerkOrgId> --apply
 *   pnpm exec tsx src/scripts/bulk-confirm-sms-consent.ts --org=<clerkOrgId> --revert --apply
 */

import { getAppPrisma } from '../lib/prisma.js';
import { DriverSmsConsentStatus } from '../generated/app-client/index.js';

/** Basis of consent: signed paper form, bulk-confirmed by an admin. Not an SMS reply. */
export const WRITTEN_FORM_METHOD = 'WRITTEN_FORM_BULK_ADMIN';

function parseArg(flag: string): string | true | null {
  const arg = process.argv.find((a) => a === flag || a.startsWith(`${flag}=`));
  if (!arg) return null;
  return arg === flag ? true : arg.split('=')[1];
}

async function main() {
  const orgArg = parseArg('--org');
  const clerkOrgId = typeof orgArg === 'string' ? orgArg : undefined;
  const apply = parseArg('--apply') !== null;
  const revert = parseArg('--revert') !== null;
  if (!clerkOrgId) throw new Error('--org=<clerkOrgId> is required');

  const prisma = getAppPrisma();

  if (revert) {
    // Roll back ONLY rows this script confirmed — never touch a real YES reply.
    const targets = await prisma.driverContact.findMany({
      where: { clerkOrgId, smsConsentMethod: WRITTEN_FORM_METHOD },
      select: { id: true, displayName: true },
    });
    console.log(`REVERT: ${targets.length} contact(s) confirmed by this script → back to PENDING`);
    for (const t of targets) console.log(`  ${t.displayName}`);
    if (!apply) return console.log('\n(dry run — pass --apply to write)');
    const r = await prisma.driverContact.updateMany({
      where: { clerkOrgId, smsConsentMethod: WRITTEN_FORM_METHOD },
      data: {
        smsConsentStatus: DriverSmsConsentStatus.PENDING,
        smsConsentConfirmedAt: null,
        smsConsentMethod: null,
      },
    });
    return console.log(`\nReverted ${r.count} contact(s).`);
  }

  // Only rostered, reachable, not-opted-out, still-PENDING drivers.
  const targets = await prisma.driverContact.findMany({
    where: {
      clerkOrgId,
      enrolled: true,
      optedOut: false,
      phoneE164: { not: null },
      smsConsentStatus: DriverSmsConsentStatus.PENDING,
    },
    select: { id: true, displayName: true, phoneE164: true },
    orderBy: { displayName: 'asc' },
  });

  console.log(`Org ${clerkOrgId}`);
  console.log(`Target: ${targets.length} PENDING contact(s) with a phone, enrolled, not opted out.\n`);
  for (const t of targets) console.log(`  ${t.displayName.padEnd(28)} ${t.phoneE164}`);

  const skipped = await prisma.driverContact.count({
    where: { clerkOrgId, enrolled: true, optedOut: false, phoneE164: null },
  });
  const optedOut = await prisma.driverContact.count({ where: { clerkOrgId, optedOut: true } });
  console.log(`\nUntouched: ${skipped} without a phone, ${optedOut} opted out.`);

  if (!apply) return console.log('\n(dry run — pass --apply to write)');

  const now = new Date();
  const result = await prisma.driverContact.updateMany({
    where: { id: { in: targets.map((t) => t.id) } },
    data: {
      smsConsentStatus: DriverSmsConsentStatus.CONFIRMED,
      smsConsentConfirmedAt: now,
      smsConsentMethod: WRITTEN_FORM_METHOD,
      // smsConsentReplyBody / smsConsentReplySid intentionally left null —
      // no driver replied; fabricating one would falsify the consent record.
    },
  });
  console.log(`\nCONFIRMED ${result.count} contact(s) at ${now.toISOString()}`);
  console.log(`method=${WRITTEN_FORM_METHOD}, reply fields left null.`);
  console.log(`Undo: re-run with --revert --apply`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
