import { describe, it, expect } from 'vitest';
import { initialConsentFields, WRITTEN_FORM_METHOD } from '../../../src/features/smsConsent/rosterConsent.js';
import { DriverSmsConsentStatus } from '../../../src/generated/app-client/index.js';

const NOW = new Date('2026-10-06T14:00:00Z');

describe('initialConsentFields', () => {
  it('leaves a new contact at the schema default when the org has no roster policy', () => {
    // No signed forms on file means we must not assert consent on anyone.
    expect(initialConsentFields(false, NOW)).toEqual({});
  });

  it('confirms a new contact where the roster IS the consent record', () => {
    // Brandon Stevenson drove for six days unreachable because a new contact
    // was born PENDING and nobody noticed. Where forms are signed at
    // enrollment, being on the roster is the record.
    expect(initialConsentFields(true, NOW)).toEqual({
      smsConsentStatus: DriverSmsConsentStatus.CONFIRMED,
      smsConsentConfirmedAt: NOW,
      smsConsentMethod: WRITTEN_FORM_METHOD,
    });
  });

  it('records the basis as the written form, not an SMS reply', () => {
    expect(initialConsentFields(true, NOW).smsConsentMethod).toBe('WRITTEN_FORM_BULK_ADMIN');
  });

  it('never fabricates a reply, because no driver texted back', () => {
    // These fields mean "the driver replied YES". Writing them would make the
    // audit trail claim something that did not happen.
    const f = initialConsentFields(true, NOW) as Record<string, unknown>;
    expect(f).not.toHaveProperty('smsConsentReplyBody');
    expect(f).not.toHaveProperty('smsConsentReplySid');
    expect(f).not.toHaveProperty('smsConsentConfirmationSid');
  });
});
