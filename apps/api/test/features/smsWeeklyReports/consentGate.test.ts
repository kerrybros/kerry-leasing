import { describe, it, expect } from 'vitest';
import { decideChannelStatus } from '../../../src/features/smsWeeklyReports/reportPolicy.js';
import { DriverSmsStatus, DriverSmsConsentStatus } from '../../../src/generated/app-client/index.js';

/**
 * Regression guard for the A2P 10DLC consent gate: an SMS must never go to a
 * driver who hasn't verified opt-in (CONFIRMED), email must NOT be blocked by
 * SMS consent, and opt-out must win over everything. Only QUEUED means "send".
 */
describe('decideChannelStatus — A2P consent gate', () => {
  const sms = {
    isEmail: false,
    enrolled: true,
    channelOptedOut: false,
    hasRecipient: true,
    dryRun: false,
    smsConsentStatus: DriverSmsConsentStatus.CONFIRMED,
  };

  it('SMS without CONFIRMED consent never queues', () => {
    for (const s of [DriverSmsConsentStatus.PENDING, DriverSmsConsentStatus.DECLINED]) {
      expect(decideChannelStatus({ ...sms, smsConsentStatus: s }).status).toBe(
        DriverSmsStatus.NO_CONSENT,
      );
    }
  });

  it('SMS with CONFIRMED consent + recipient → QUEUED', () => {
    expect(decideChannelStatus(sms).status).toBe(DriverSmsStatus.QUEUED);
  });

  it('email is NOT gated by SMS consent (PENDING still queues)', () => {
    expect(
      decideChannelStatus({ ...sms, isEmail: true, smsConsentStatus: DriverSmsConsentStatus.PENDING })
        .status,
    ).toBe(DriverSmsStatus.QUEUED);
  });

  it('opt-out is checked before consent → OPTED_OUT', () => {
    expect(
      decideChannelStatus({
        ...sms,
        channelOptedOut: true,
        smsConsentStatus: DriverSmsConsentStatus.PENDING,
      }).status,
    ).toBe(DriverSmsStatus.OPTED_OUT);
  });

  it('not enrolled → SKIPPED', () => {
    expect(decideChannelStatus({ ...sms, enrolled: false }).status).toBe(DriverSmsStatus.SKIPPED);
  });

  it('CONFIRMED but no recipient → NO_PHONE (sms) / NO_EMAIL (email)', () => {
    expect(decideChannelStatus({ ...sms, hasRecipient: false }).status).toBe(
      DriverSmsStatus.NO_PHONE,
    );
    expect(decideChannelStatus({ ...sms, isEmail: true, hasRecipient: false }).status).toBe(
      DriverSmsStatus.NO_EMAIL,
    );
  });

  it('dry-run (would otherwise queue) → SKIPPED', () => {
    expect(decideChannelStatus({ ...sms, dryRun: true }).status).toBe(DriverSmsStatus.SKIPPED);
  });
});
