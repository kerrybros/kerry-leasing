/**
 * DISPATCH A FROZEN WEEK
 *
 * Sends the cards a `prepare` run already froze, and recomputes nothing.
 *
 * This is the half of the split that makes the early operator report honest.
 * `prepare` runs at 07:00 ET, writes one row per driver holding the exact card
 * body, token and kpiSnapshot, and the report emailed at 07:00 is built from
 * those rows. Dispatch then sends those same rows at 10:00. Because it reads
 * the frozen body rather than rebuilding it, nothing Motive publishes in
 * between can make the cards disagree with the report that described them.
 *
 * What it deliberately does NOT do:
 *  - rebuild KPIs. A rebuild is how the report and the cards drift apart.
 *  - send to a driver who already has their card. Only QUEUED rows are picked
 *    up, so a second run, a retry or a manual invocation is a no-op.
 *
 * If no frozen rows exist (a prepare that was held, or never ran), dispatch
 * reports that and the caller falls back to the original one-pass send. The
 * week always goes out.
 */

import { getAppPrisma } from '../../lib/prisma.js';
import { config } from '../../config.js';
import { sendSms } from '../../integrations/twilio/client.js';
import { sendEmail } from '../../integrations/email/client.js';
import { formatEmailBody } from './emailBodyFormatter.js';
import { getLastWeekRange } from './dateWindow.js';
import { DriverSmsStatus } from '../../generated/app-client/index.js';

export interface DispatchResult {
  clerkOrgId: string;
  weekStart: string;
  weekEnd: string;
  /** False when there was nothing frozen to send: the caller should fall back. */
  hadFrozenWeek: boolean;
  queued: number;
  sent: number;
  failed: number;
  /** Rows skipped because the driver already had their card. */
  alreadyDelivered: number;
  errors: string[];
}

function reportUrl(token: string): string {
  return `${config.reportPublicBaseUrl.replace(/\/$/, '')}/r/${token}`;
}

function unsubscribeUrl(token: string): string {
  return `${config.reportPublicBaseUrl.replace(/\/$/, '')}/u/${token}`;
}

export async function dispatchFrozenWeek(
  clerkOrgId: string,
  options: { now?: Date; dryRun?: boolean; onlyDriverContactId?: string } = {},
): Promise<DispatchResult> {
  const prisma = getAppPrisma();
  const week = getLastWeekRange(options.now ?? new Date());
  const result: DispatchResult = {
    clerkOrgId,
    weekStart: week.startDate,
    weekEnd: week.endDate,
    hadFrozenWeek: false,
    queued: 0,
    sent: 0,
    failed: 0,
    alreadyDelivered: 0,
    errors: [],
  };

  const rows = await prisma.driverWeeklyReportSent.findMany({
    where: {
      clerkOrgId,
      weekStartDate: week.startDate,
      isTest: false,
      ...(options.onlyDriverContactId ? { driverContactId: options.onlyDriverContactId } : {}),
    },
    select: {
      id: true,
      driverContactId: true,
      channel: true,
      status: true,
      token: true,
      bodyPreview: true,
      kpiSnapshot: true,
    },
  });
  if (rows.length === 0) return result;
  result.hadFrozenWeek = true;
  result.alreadyDelivered = rows.filter(
    (r) => r.status === DriverSmsStatus.SENT || r.status === DriverSmsStatus.DELIVERED,
  ).length;

  // Only QUEUED rows are sendable. Everything else is either already delivered
  // or was suppressed at prepare time for a reason that still stands.
  const toSend = rows.filter((r) => r.status === DriverSmsStatus.QUEUED);
  result.queued = toSend.length;
  if (toSend.length === 0) return result;

  const contacts = await prisma.driverContact.findMany({
    where: { clerkOrgId, id: { in: [...new Set(toSend.map((r) => r.driverContactId))] } },
    select: { id: true, phoneE164: true, email: true },
  });
  const contactById = new Map(contacts.map((c) => [c.id, c]));

  for (const row of toSend) {
    const contact = contactById.get(row.driverContactId);
    const isEmail = row.channel === 'EMAIL';
    const recipient = isEmail ? contact?.email : contact?.phoneE164;
    if (!recipient) {
      result.errors.push(`${row.driverContactId}: no ${isEmail ? 'email' : 'phone'} at dispatch time`);
      result.failed++;
      await prisma.driverWeeklyReportSent.update({
        where: { id: row.id },
        data: { status: isEmail ? DriverSmsStatus.NO_EMAIL : DriverSmsStatus.NO_PHONE },
      });
      continue;
    }

    if (options.dryRun) {
      result.sent++;
      continue;
    }

    let status: DriverSmsStatus;
    let twilioSid: string | null = null;
    let twilioErrorCode: string | null = null;
    let errorMessage: string | null = null;

    if (isEmail) {
      // The envelope is re-rendered from the frozen snapshot and the frozen
      // token, so it is a pure function of what prepare stored. The figures
      // the driver sees live on the report page behind the token, which reads
      // the same frozen row.
      const snap = (row.kpiSnapshot ?? {}) as { firstName?: string; noActivity?: boolean };
      const parts = formatEmailBody({
        firstName: snap.firstName ?? '',
        noActivity: snap.noActivity === true,
        reportUrl: reportUrl(row.token),
        unsubscribeUrl: unsubscribeUrl(row.token),
      });
      const res = await sendEmail({
        to: recipient,
        subject: parts.subject,
        text: parts.text,
        html: parts.html,
      });
      status = res.status === 'failed' ? DriverSmsStatus.FAILED : DriverSmsStatus.SENT;
      errorMessage = res.errorMessage;
    } else {
      if (!row.bodyPreview) {
        result.errors.push(`${row.driverContactId}: frozen row carried no message body`);
        result.failed++;
        continue;
      }
      const res = await sendSms({ to: recipient, body: row.bodyPreview });
      status = res.status === 'failed' ? DriverSmsStatus.FAILED : DriverSmsStatus.SENT;
      twilioSid = res.sid;
      twilioErrorCode = res.errorCode;
      errorMessage = res.errorMessage;
    }

    if (status === DriverSmsStatus.SENT) result.sent++;
    else {
      result.failed++;
      result.errors.push(`${row.driverContactId}: ${errorMessage ?? 'send failed'}`);
    }

    // sentAt is set here rather than at prepare, so the row records when the
    // driver was actually contacted and not when the card was frozen.
    await prisma.driverWeeklyReportSent.update({
      where: { id: row.id },
      data: { status, twilioSid, twilioErrorCode, sentAt: new Date() },
    });
    if (status === DriverSmsStatus.FAILED && !isEmail) {
      await prisma.driverContact
        .update({ where: { id: row.driverContactId }, data: { lastTwilioError: errorMessage } })
        .catch(() => undefined);
    }

    await new Promise((r) => setTimeout(r, 200));
  }

  return result;
}
