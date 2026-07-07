/**
 * Pure decision logic for the weekly driver report — no config, no prisma, no
 * providers imported. Kept dependency-free so these rules (the "money paths")
 * are unit-tested in isolation without booting the app.
 */
import { DriverSmsStatus, DriverSmsConsentStatus } from '../../generated/app-client/index.js';

/**
 * A driver belongs in the ranked/report population if they can receive the
 * report on ANY channel — SMS (phone, not opted out) OR Email (email, not
 * email-opted-out). If this checked phone only, email-only drivers would fall
 * out of ranking and render "rank 0 of N".
 */
export function isReportReachable(r: {
  optedOut: boolean;
  phoneE164: string | null;
  emailOptedOut: boolean;
  email: string | null;
}): boolean {
  return (!r.optedOut && r.phoneE164 != null) || (!r.emailOptedOut && r.email != null);
}

/**
 * Per-(driver, channel) send decision. Order is load-bearing: opt-out is checked
 * BEFORE consent, and the A2P consent gate applies only to SMS (email is never
 * blocked by SMS consent). Any status other than QUEUED means "don't send".
 */
export function decideChannelStatus(input: {
  enrolled: boolean;
  channelOptedOut: boolean;
  isEmail: boolean;
  smsConsentStatus: DriverSmsConsentStatus;
  hasRecipient: boolean;
  dryRun: boolean;
}): { status: DriverSmsStatus; skipReason: string | null } {
  if (!input.enrolled) return { status: DriverSmsStatus.SKIPPED, skipReason: 'not-enrolled' };
  if (input.channelOptedOut) return { status: DriverSmsStatus.OPTED_OUT, skipReason: null };
  if (!input.isEmail && input.smsConsentStatus !== DriverSmsConsentStatus.CONFIRMED)
    return { status: DriverSmsStatus.NO_CONSENT, skipReason: 'no-sms-consent' };
  if (!input.hasRecipient)
    return {
      status: input.isEmail ? DriverSmsStatus.NO_EMAIL : DriverSmsStatus.NO_PHONE,
      skipReason: null,
    };
  if (input.dryRun) return { status: DriverSmsStatus.SKIPPED, skipReason: 'dry-run' };
  return { status: DriverSmsStatus.QUEUED, skipReason: null };
}
