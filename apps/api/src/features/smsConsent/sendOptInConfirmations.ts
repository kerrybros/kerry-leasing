/**
 * SMS DOUBLE OPT-IN — confirmation sender.
 *
 * Sends the one-time "reply YES" confirmation to rostered driver contacts that
 * do not yet have a verified opt-in. The driver's inbound YES is captured by the
 * Twilio inbound webhook (routes/twilioWebhooks.ts), which flips the contact to
 * smsConsentStatus = CONFIRMED. Only CONFIRMED contacts are ever sent a weekly
 * scorecard (see sendOrgWeeklyReports.ts).
 *
 * This never enrolls anyone automatically — enrollment requires the driver's own
 * affirmative reply. That is the whole point of the flow and what makes the
 * campaign's Call-to-Action verifiable for A2P 10DLC.
 *
 * Honors the same DRY_RUN mode as the rest of the SMS pipeline via sendSms().
 */

import { getAppPrisma } from '../../lib/prisma.js';
import { sendSms } from '../../integrations/twilio/client.js';
import { DriverSmsConsentStatus } from '../../generated/app-client/index.js';
import { formatOptInConfirmation, OPT_IN_METHOD } from './optInMessage.js';

export interface SendOptInOptions {
  /** Re-send to contacts already requested but not yet confirmed (default false). */
  resend?: boolean;
  /** Limit to a single contact (admin "send to this driver" action). */
  onlyDriverContactId?: string;
  dryRun?: boolean;
}

export interface SendOptInResult {
  clerkOrgId: string;
  candidates: number;   // contacts eligible for a confirmation
  sent: number;         // confirmations actually dispatched (or dry-run counted)
  failed: number;
  skippedNoPhone: number;
  alreadyConfirmed: number;
  contacts: Array<{
    driverContactId: string;
    displayName: string;
    phoneE164: string | null;
    result: 'sent' | 'dry-run' | 'failed' | 'no-phone';
    twilioSid: string | null;
    error?: string | null;
  }>;
}

export async function sendOptInConfirmations(
  clerkOrgId: string,
  options: SendOptInOptions = {}
): Promise<SendOptInResult> {
  const prisma = getAppPrisma();

  const contacts = await prisma.driverContact.findMany({
    where: {
      clerkOrgId,
      enrolled: true,
      optedOut: false,
      ...(options.onlyDriverContactId ? { id: options.onlyDriverContactId } : {}),
      // Only PENDING contacts need a confirmation. If resend is off, skip those
      // we've already asked (requestedAt set) so re-running doesn't spam drivers.
      smsConsentStatus: DriverSmsConsentStatus.PENDING,
      ...(options.resend ? {} : { smsConsentRequestedAt: null }),
    },
    select: { id: true, displayName: true, phoneE164: true },
  });

  const result: SendOptInResult = {
    clerkOrgId,
    candidates: contacts.length,
    sent: 0,
    failed: 0,
    skippedNoPhone: 0,
    alreadyConfirmed: 0,
    contacts: [],
  };

  const body = formatOptInConfirmation();

  for (const c of contacts) {
    if (!c.phoneE164) {
      result.skippedNoPhone++;
      result.contacts.push({
        driverContactId: c.id,
        displayName: c.displayName,
        phoneE164: null,
        result: 'no-phone',
        twilioSid: null,
      });
      continue;
    }

    if (options.dryRun) {
      result.sent++;
      result.contacts.push({
        driverContactId: c.id,
        displayName: c.displayName,
        phoneE164: c.phoneE164,
        result: 'dry-run',
        twilioSid: null,
      });
      continue;
    }

    const res = await sendSms({ to: c.phoneE164, body });
    const ok = res.status !== 'failed';

    // Record that we requested consent. Status stays PENDING until the driver
    // replies YES (handled by the inbound webhook). We stamp requestedAt + the
    // confirmation SID so the audit trail shows exactly when we asked.
    await prisma.driverContact.update({
      where: { id: c.id },
      data: {
        smsConsentRequestedAt: new Date(),
        smsConsentMethod: OPT_IN_METHOD,
        smsConsentConfirmationSid: res.sid,
        ...(ok ? {} : { lastTwilioError: res.errorMessage }),
      },
    });

    if (ok) result.sent++;
    else result.failed++;
    result.contacts.push({
      driverContactId: c.id,
      displayName: c.displayName,
      phoneE164: c.phoneE164,
      result: ok ? 'sent' : 'failed',
      twilioSid: res.sid,
      error: res.errorMessage,
    });

    // Pace to stay well under A2P throughput limits (matches weekly-send pacing).
    await new Promise((r) => setTimeout(r, 200));
  }

  return result;
}
