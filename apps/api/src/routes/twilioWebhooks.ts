/**
 * TWILIO WEBHOOKS
 * Public endpoints called by Twilio. Two paths:
 *  - /inbound  → captures STOP/START keyword replies. Twilio still enforces
 *               opt-out at carrier level; we mirror state in DB so admin can
 *               see who has opted out and so re-enrollment via START works.
 *  - /status   → delivery status callback. Updates DriverWeeklyReportSent
 *               by MessageSid (DELIVERED / FAILED).
 *
 * Twilio webhooks come as application/x-www-form-urlencoded — the
 * express.urlencoded parser is mounted on this router only.
 */

import { Router, Request, Response, urlencoded } from 'express';
import { getAppPrisma } from '../lib/prisma.js';
import { validateInboundSignature } from '../integrations/twilio/client.js';
import {
  DriverSmsStatus,
  TwilioInboundEventType,
} from '../generated/app-client/index.js';

const router = Router();

// Twilio posts as form-urlencoded. Local parser so the rest of the API stays JSON-only.
router.use(urlencoded({ extended: false }));

const STOP_KEYWORDS = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'OPTOUT']);
const START_KEYWORDS = new Set(['START', 'YES', 'UNSTOP', 'OPTIN']);

function normalizeBody(b: unknown): string {
  return typeof b === 'string' ? b.trim().toUpperCase() : '';
}

function fullUrl(req: Request): string {
  // Twilio signs the URL it called; respect any reverse-proxy host header.
  const host = req.headers.host;
  const proto = (req.headers['x-forwarded-proto'] as string) ?? req.protocol;
  return `${proto}://${host}${req.originalUrl}`;
}

router.post('/inbound', async (req: Request, res: Response) => {
  const sig = req.headers['x-twilio-signature'] as string | undefined;
  const params = req.body as Record<string, string>;
  if (!validateInboundSignature(sig, fullUrl(req), params)) {
    return res.status(403).send('forbidden');
  }

  const prisma = getAppPrisma();
  const fromPhone = params.From ?? null;
  const toPhone = params.To ?? null;
  const messageSid = params.MessageSid ?? params.SmsMessageSid ?? null;
  const body = normalizeBody(params.Body);

  const isStop = STOP_KEYWORDS.has(body);
  const isStart = START_KEYWORDS.has(body);
  const eventType: TwilioInboundEventType = isStart
    ? TwilioInboundEventType.INBOUND_START
    : TwilioInboundEventType.INBOUND_STOP;

  let matchedDriverContactId: string | null = null;
  if ((isStop || isStart) && fromPhone) {
    const contact = await prisma.driverContact.findFirst({
      where: { phoneE164: fromPhone },
      select: { id: true },
    });
    if (contact) {
      matchedDriverContactId = contact.id;
      await prisma.driverContact.update({
        where: { id: contact.id },
        data: isStop
          ? { optedOut: true, optedOutAt: new Date() }
          : { optedOut: false, optedOutAt: null },
      });
    }
  }

  await prisma.twilioInboundLog.create({
    data: {
      eventType: isStop || isStart ? eventType : TwilioInboundEventType.INBOUND_STOP,
      fromPhone,
      toPhone,
      messageSid,
      body: typeof params.Body === 'string' ? params.Body : null,
      raw: params as object,
      matchedDriverContactId,
      processedAt: new Date(),
    },
  });

  // Empty TwiML reply — Twilio's Messaging Service handles the carrier-mandated
  // auto-reply for STOP/START when configured at the Service level.
  res.setHeader('Content-Type', 'text/xml');
  res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
});

router.post('/status', async (req: Request, res: Response) => {
  const sig = req.headers['x-twilio-signature'] as string | undefined;
  const params = req.body as Record<string, string>;
  if (!validateInboundSignature(sig, fullUrl(req), params)) {
    return res.status(403).send('forbidden');
  }

  const prisma = getAppPrisma();
  const messageSid = params.MessageSid ?? params.SmsMessageSid ?? null;
  const messageStatus = params.MessageStatus ?? null;
  const errorCode = params.ErrorCode ?? null;

  if (messageSid) {
    const sent = await prisma.driverWeeklyReportSent.findFirst({
      where: { twilioSid: messageSid },
      select: { id: true },
    });
    if (sent) {
      const mapped: DriverSmsStatus | null =
        messageStatus === 'delivered' ? DriverSmsStatus.DELIVERED :
        messageStatus === 'failed' || messageStatus === 'undelivered' ? DriverSmsStatus.FAILED :
        null;
      if (mapped) {
        await prisma.driverWeeklyReportSent.update({
          where: { id: sent.id },
          data: {
            status: mapped,
            twilioErrorCode: errorCode,
          },
        });
      }
    }
  }

  await prisma.twilioInboundLog.create({
    data: {
      eventType: TwilioInboundEventType.STATUS_CALLBACK,
      fromPhone: params.From ?? null,
      toPhone: params.To ?? null,
      messageSid,
      messageStatus,
      errorCode,
      raw: params as object,
      processedAt: new Date(),
    },
  });

  res.json({ ok: true });
});

export default router;
