/**
 * One phone normalizer for driver contacts.
 *
 * Numbers reach us from three places in different shapes: Whiparound, Motive
 * (bare 10-digit US strings), and admins typing them in. They all have to land
 * in the same E.164 form, because driver_contacts.phone_e164 is uniquely
 * constrained per org and Twilio needs E.164 anyway.
 */
import { parsePhoneNumber } from 'libphonenumber-js';

export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const parsed = parsePhoneNumber(String(raw).trim(), 'US');
    return parsed && parsed.isValid() ? parsed.number : null;
  } catch {
    return null;
  }
}
