/**
 * Roster-as-consent.
 *
 * Where a customer's drivers sign a written SMS form at enrollment, being on
 * the roster IS the consent record. Contacts auto-created from telematics are
 * then born CONFIRMED rather than PENDING.
 *
 * This exists because the opposite default kept producing a silent gap: a
 * driver started work, a contact was auto-created at PENDING, and they received
 * nothing until somebody noticed and ran the bulk confirm by hand. Brandon
 * Stevenson drove for six days that way.
 *
 * Per-org and false by default, deliberately. Auto-confirming consent is only
 * honest where the signed forms are actually on file, which is a fact about a
 * customer's paperwork rather than something to assume for everyone. The basis
 * is recorded in smsConsentMethod so the audit trail says how consent arose,
 * and the reply fields stay null because no driver ever texted back.
 */

import { getAppPrisma } from '../../lib/prisma.js';
import { DriverSmsConsentStatus } from '../../generated/app-client/index.js';

/** Basis of consent: signed paper form, established by roster membership. */
export const WRITTEN_FORM_METHOD = 'WRITTEN_FORM_BULK_ADMIN';

export async function rosterImpliesSmsConsent(clerkOrgId: string): Promise<boolean> {
  const cfg = await getAppPrisma().customerSmsReportConfig.findUnique({
    where: { clerkOrgId },
    select: { rosterImpliesSmsConsent: true },
  });
  return cfg?.rosterImpliesSmsConsent === true;
}

/**
 * The consent fields a newly auto-created contact should carry. Returns an
 * empty object when the org has no roster-consent policy, leaving the schema
 * default of PENDING in place.
 */
export function initialConsentFields(rosterConsent: boolean, now: Date = new Date()) {
  if (!rosterConsent) return {};
  return {
    smsConsentStatus: DriverSmsConsentStatus.CONFIRMED,
    smsConsentConfirmedAt: now,
    smsConsentMethod: WRITTEN_FORM_METHOD,
  };
}
