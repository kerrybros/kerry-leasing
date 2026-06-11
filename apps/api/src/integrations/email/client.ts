/**
 * EMAIL CLIENT
 *
 * Thin wrapper over Microsoft Graph sendMail for transactional report emails.
 * Mirrors integrations/twilio/client.ts: dry-run aware and never throws —
 * returns a typed result the caller persists.
 *
 * Dry-run (config.emailDryRun) is auto-true until REPORT_EMAIL_FROM is set and
 * Microsoft Graph is configured, so the pipeline can run end-to-end (writing
 * send rows) before the mailbox is provisioned.
 */

import { config } from '../../config.js';
import { sendMail } from '../microsoft/graphClient.js';

export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface SendEmailResult {
  status: 'sent' | 'failed' | 'dry-run';
  errorMessage: string | null;
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  if (config.emailDryRun || !config.microsoftGraph || !config.reportEmailFrom) {
    return { status: 'dry-run', errorMessage: null };
  }
  try {
    await sendMail(config.microsoftGraph, {
      from: config.reportEmailFrom,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
    return { status: 'sent', errorMessage: null };
  } catch (err) {
    return {
      status: 'failed',
      errorMessage: err instanceof Error ? err.message : String(err),
    };
  }
}
