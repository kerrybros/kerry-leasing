/**
 * Fall back to Motive's phone number when Whiparound has none.
 *
 * Driver phone numbers have only ever come from Whiparound, because the
 * lazy-create path in the weekly report builder was written on 2026-05-13 and
 * `motive_driver_master`, the only table carrying Motive's phone, arrived on
 * 2026-05-14. Nobody wired it back in. The effect was drivers who exist in
 * Motive with a phone on file sitting in our contacts with none, so the weekly
 * report skipped them forever (Ezekiel King-Davis and Jamie Shell, found
 * 2026-09-25 when the customer asked why one of them never got a report).
 *
 * Whiparound stays authoritative: this only ever fills an EMPTY phone, and
 * never overwrites one that is already set from any source.
 */
import type { PrismaClient } from '../../generated/app-client/index.js';
import { normalizePhone } from './phone.js';

export interface PhoneFallbackResult {
  /** Contacts that had no phone and now would get / did get one. */
  filled: Array<{ contactId: string; displayName: string; motiveDriverId: number; phoneE164: string }>;
  /** Had no phone, and Motive had nothing usable either. */
  stillMissing: Array<{ displayName: string; reason: string }>;
}

/**
 * Fill empty phone numbers on an org's driver contacts from Motive's roster.
 * Pass `apply: false` to see what it would do without writing.
 */
export async function fillMissingPhonesFromMotive(
  prisma: PrismaClient,
  clerkOrgId: string,
  opts: { apply: boolean }
): Promise<PhoneFallbackResult> {
  const result: PhoneFallbackResult = { filled: [], stillMissing: [] };

  const contacts = await prisma.driverContact.findMany({
    where: { clerkOrgId, OR: [{ phoneE164: null }, { phoneE164: '' }] },
    select: { id: true, displayName: true, motiveDriverId: true },
  });
  if (contacts.length === 0) return result;

  const masters = await prisma.motiveDriverMaster.findMany({
    where: { clerkOrgId, motiveDriverId: { in: contacts.map((c) => c.motiveDriverId).filter((x): x is number => x != null) } },
    select: { motiveDriverId: true, phone: true, status: true },
  });
  const byId = new Map(masters.map((m) => [m.motiveDriverId, m]));

  // Numbers already in use in this org: the (org, phone) unique constraint means
  // a duplicate would throw, and a shared number is a data problem to surface,
  // not to silently resolve.
  const taken = new Set(
    (await prisma.driverContact.findMany({
      where: { clerkOrgId, NOT: [{ phoneE164: null }, { phoneE164: '' }] },
      select: { phoneE164: true },
    })).map((c) => c.phoneE164 as string)
  );

  for (const c of contacts) {
    if (c.motiveDriverId == null) {
      result.stillMissing.push({ displayName: c.displayName, reason: 'contact is not linked to a Motive driver' });
      continue;
    }
    const master = byId.get(c.motiveDriverId);
    if (!master?.phone) {
      result.stillMissing.push({ displayName: c.displayName, reason: 'Motive has no phone for this driver' });
      continue;
    }
    const phoneE164 = normalizePhone(master.phone);
    if (!phoneE164) {
      result.stillMissing.push({ displayName: c.displayName, reason: `Motive phone is not a valid US number` });
      continue;
    }
    if (taken.has(phoneE164)) {
      result.stillMissing.push({ displayName: c.displayName, reason: 'that number is already on another contact in this org' });
      continue;
    }
    if (opts.apply) {
      await prisma.driverContact.update({ where: { id: c.id }, data: { phoneE164 }, select: { id: true } });
    }
    taken.add(phoneE164);
    result.filled.push({ contactId: c.id, displayName: c.displayName, motiveDriverId: c.motiveDriverId, phoneE164 });
  }
  return result;
}
