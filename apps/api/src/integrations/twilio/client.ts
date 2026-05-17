/**
 * TWILIO CLIENT
 * Thin wrapper over the official twilio SDK. Honors a DRY_RUN mode that
 * short-circuits real API calls — used during local dev and the foundation
 * phase before A2P 10DLC approval is finalized.
 */

import twilio from 'twilio';
import type { Twilio } from 'twilio';
import { config } from '../../config.js';

export interface SendSmsArgs {
  to: string;                  // E.164 phone number
  body: string;
  statusCallbackUrl?: string | null;
}

export interface SendSmsResult {
  sid: string | null;          // Twilio MessageSid, null in dry-run
  status: string;              // 'queued' | 'dry-run' | 'failed'
  errorCode: string | null;
  errorMessage: string | null;
}

let clientSingleton: Twilio | null = null;

function getClient(): Twilio | null {
  if (config.smsDryRun || !config.twilio) return null;
  if (!clientSingleton) {
    clientSingleton = twilio(config.twilio.accountSid, config.twilio.authToken);
  }
  return clientSingleton;
}

export async function sendSms(args: SendSmsArgs): Promise<SendSmsResult> {
  const client = getClient();

  // Dry-run path: no Twilio call. Returns a synthetic dry-run result so callers
  // can persist DriverWeeklyReportSent rows for QA without touching carriers.
  if (!client || !config.twilio) {
    console.log(`[Twilio DRY-RUN] would send to ${args.to}: ${args.body.slice(0, 80)}…`);
    return { sid: null, status: 'dry-run', errorCode: null, errorMessage: null };
  }

  try {
    const message = await client.messages.create({
      to: args.to,
      body: args.body,
      messagingServiceSid: config.twilio.messagingServiceSid,
      statusCallback: args.statusCallbackUrl ?? config.twilio.statusCallbackUrl ?? undefined,
    });
    return {
      sid: message.sid,
      status: message.status,
      errorCode: message.errorCode ? String(message.errorCode) : null,
      errorMessage: message.errorMessage ?? null,
    };
  } catch (err: any) {
    return {
      sid: null,
      status: 'failed',
      errorCode: err.code ? String(err.code) : null,
      errorMessage: err.message ?? String(err),
    };
  }
}

/** Validate an inbound Twilio webhook signature. Returns true on dry-run mode for local testing. */
export function validateInboundSignature(
  signatureHeader: string | undefined,
  fullUrl: string,
  params: Record<string, string>
): boolean {
  // Skip signature checks ONLY outside production (local dev without creds).
  // In production we must fail CLOSED: no auth token => the request cannot be
  // verified as coming from Twilio => reject. Failing open here would leave the
  // public /webhooks/twilio/* endpoints accepting forged unauthenticated POSTs
  // whenever Twilio is unconfigured (e.g. pre-launch dry-run on prod).
  if (config.nodeEnv !== 'production' && (config.smsDryRun || !config.twilio)) return true;
  if (!config.twilio || !signatureHeader) return false;
  return twilio.validateRequest(config.twilio.authToken, signatureHeader, fullUrl, params);
}
