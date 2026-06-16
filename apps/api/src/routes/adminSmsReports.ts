/**
 * ADMIN SMS REPORTS — config, drivers, send history, test send, force trigger.
 * Mounted under clerkAuthMiddleware + requireOrg + requireRole(['internal']).
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { randomBytes } from 'crypto';
import { parsePhoneNumber } from 'libphonenumber-js';
import { getAppPrisma } from '../lib/prisma.js';
import { AuthRequest } from '../middleware/auth.js';
import { sendSms } from '../integrations/twilio/client.js';
import { config } from '../config.js';
import {
  DriverContactSource,
  DriverSmsStatus,
} from '../generated/app-client/index.js';
import { buildWeeklyReports } from '../features/smsWeeklyReports/weeklyReportBuilder.js';
import { loadExcludedMotiveDriverIds } from '../features/drivers/excludedDrivers.js';
import { formatSmsBody } from '../features/smsWeeklyReports/smsBodyFormatter.js';
import { runWeeklyDriverSms } from '../features/smsWeeklyReports/runWeeklyDriverSms.js';
import { resolveChannels } from '../features/smsWeeklyReports/sendOrgWeeklyReports.js';

const router = Router();

const KpiSchema = z.enum(['SAFETY', 'IDLE_PCT', 'MPG', 'MILES', 'HARD_EVENTS']);
const ChannelSchema = z.enum(['SMS', 'EMAIL']);
const ConfigUpdateSchema = z.object({
  enabled: z.boolean().optional(),
  kpis: z.array(KpiSchema).optional(),
  channels: z.array(ChannelSchema).min(1).optional(),
  sendHourEt: z.number().int().min(0).max(23).optional(),
});

const DriverCreateSchema = z.object({
  displayName: z.string().min(1),
  phoneE164: z.string().optional(),
  motiveDriverId: z.number().int().optional(),
});

const DriverUpdateSchema = z.object({
  displayName: z.string().min(1).optional(),
  phoneE164: z.string().nullable().optional(),
  motiveDriverId: z.number().int().nullable().optional(),
  whiparoundDriverId: z.number().int().nullable().optional(),
  email: z.string().nullable().optional(),
  enrolled: z.boolean().optional(),
});

const SendTestSchema = z.object({
  phoneE164: z.string().min(8),
  driverContactId: z.string().optional(),
});

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const parsed = parsePhoneNumber(raw, 'US');
    if (!parsed || !parsed.isValid()) return null;
    return parsed.number; // E.164
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

router.get('/config', async (req: AuthRequest, res: Response) => {
  const orgId = req.auth!.orgId!;
  const prisma = getAppPrisma();
  const cfg = await prisma.customerSmsReportConfig.findUnique({ where: { clerkOrgId: orgId } });
  const base = cfg ?? {
    clerkOrgId: orgId,
    enabled: false,
    kpis: ['SAFETY', 'IDLE_PCT', 'MPG', 'MILES', 'HARD_EVENTS'],
    sendHourEt: 5,
    lastSentAt: null,
  };
  res.json({
    // channels is stored as nullable JSON; normalize to a clean ['SMS'|'EMAIL'] list.
    config: { ...base, channels: resolveChannels(cfg?.channels) },
    dryRun: config.smsDryRun,        // SMS provider (Twilio) in dry-run?
    emailDryRun: config.emailDryRun, // Email provider (Graph) in dry-run?
  });
});

router.put('/config', async (req: AuthRequest, res: Response) => {
  const orgId = req.auth!.orgId!;
  const parsed = ConfigUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Bad Request', issues: parsed.error.issues });

  const prisma = getAppPrisma();
  const saved = await prisma.customerSmsReportConfig.upsert({
    where: { clerkOrgId: orgId },
    create: {
      clerkOrgId: orgId,
      enabled: parsed.data.enabled ?? false,
      kpis: parsed.data.kpis ?? ['SAFETY', 'IDLE_PCT', 'MPG', 'MILES', 'HARD_EVENTS'],
      channels: parsed.data.channels ?? ['SMS'],
      sendHourEt: parsed.data.sendHourEt ?? 5,
    },
    update: {
      ...(parsed.data.enabled !== undefined && { enabled: parsed.data.enabled }),
      ...(parsed.data.kpis !== undefined && { kpis: parsed.data.kpis }),
      ...(parsed.data.channels !== undefined && { channels: parsed.data.channels }),
      ...(parsed.data.sendHourEt !== undefined && { sendHourEt: parsed.data.sendHourEt }),
    },
  });
  res.json({ config: saved });
});

// ---------------------------------------------------------------------------
// Drivers
// ---------------------------------------------------------------------------

router.get('/drivers', async (req: AuthRequest, res: Response) => {
  const orgId = req.auth!.orgId!;
  const prisma = getAppPrisma();

  const contactsRaw = await prisma.driverContact.findMany({
    where: { clerkOrgId: orgId },
    orderBy: { displayName: 'asc' },
  });

  // Drop drivers an admin has excluded from the portal. Only applies to
  // Motive-linked contacts; WhipAround-only contacts (motiveDriverId null)
  // are never affected by the Motive exclusion list.
  const excluded = await loadExcludedMotiveDriverIds(prisma, orgId);
  const contacts = excluded.size > 0
    ? contactsRaw.filter((c) => c.motiveDriverId == null || !excluded.has(c.motiveDriverId))
    : contactsRaw;

  // Most-recent send per driver for the "last status" column
  const recentSends = await prisma.driverWeeklyReportSent.findMany({
    where: { clerkOrgId: orgId, driverContactId: { in: contacts.map((c) => c.id) } },
    orderBy: { sentAt: 'desc' },
  });
  const lastByDriver = new Map<string, typeof recentSends[number]>();
  for (const s of recentSends) {
    if (!lastByDriver.has(s.driverContactId)) lastByDriver.set(s.driverContactId, s);
  }

  // Cross-system match status. We treat the row as fully matched when both
  // motiveDriverId and whiparoundDriverId are set.
  type MatchStatus = 'FULL' | 'MOTIVE_ONLY' | 'WHIPAROUND_ONLY' | 'NEITHER';
  const matchStatusOf = (c: typeof contacts[number]): MatchStatus => {
    const hasMotive = c.motiveDriverId != null;
    const hasWp = c.whiparoundDriverId != null;
    if (hasMotive && hasWp) return 'FULL';
    if (hasMotive) return 'MOTIVE_ONLY';
    if (hasWp) return 'WHIPAROUND_ONLY';
    return 'NEITHER';
  };

  res.json({
    drivers: contacts.map((c) => {
      const last = lastByDriver.get(c.id) ?? null;
      return {
        ...c,
        matchStatus: matchStatusOf(c),
        lastSentAt: last?.sentAt ?? null,
        lastStatus: last?.status ?? null,
        lastError: last?.twilioErrorCode ?? null,
      };
    }),
  });
});

/**
 * POST /admin/sms-reports/drivers/:id/merge-into
 * Body: { targetId: string }
 * Merges this row INTO `targetId` and deletes this row. Fills missing fields
 * on the target (never overwrites existing target values). All
 * DriverWeeklyReportSent history on this row is reassigned to the target.
 */
const MergeIntoSchema = z.object({ targetId: z.string().min(1) });
router.post('/drivers/:id/merge-into', async (req: AuthRequest, res: Response) => {
  const orgId = req.auth!.orgId!;
  const parsed = MergeIntoSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Bad Request', issues: parsed.error.issues });

  const prisma = getAppPrisma();
  const sourceId = req.params.id;
  const targetId = parsed.data.targetId;
  if (sourceId === targetId) return res.status(400).json({ error: 'Bad Request', message: 'Cannot merge a row into itself' });

  const [source, target] = await Promise.all([
    prisma.driverContact.findFirst({ where: { id: sourceId, clerkOrgId: orgId } }),
    prisma.driverContact.findFirst({ where: { id: targetId, clerkOrgId: orgId } }),
  ]);
  if (!source || !target) return res.status(404).json({ error: 'Not Found', message: 'Source or target driver not found in this org' });

  // Merge rule: target keeps its identity (name, source) but gains any missing IDs/email/phone from source.
  const mergedPatch: Record<string, unknown> = {};
  if (target.motiveDriverId == null && source.motiveDriverId != null) mergedPatch.motiveDriverId = source.motiveDriverId;
  if (target.whiparoundDriverId == null && source.whiparoundDriverId != null) mergedPatch.whiparoundDriverId = source.whiparoundDriverId;
  if (!target.email && source.email) mergedPatch.email = source.email;
  if (!target.phoneE164 && source.phoneE164) mergedPatch.phoneE164 = source.phoneE164;

  try {
    await prisma.$transaction([
      // Re-point history to target
      prisma.driverWeeklyReportSent.updateMany({
        where: { clerkOrgId: orgId, driverContactId: sourceId },
        data: { driverContactId: targetId },
      }),
      // Delete source first to release unique constraints (phoneE164, normalizedName)
      prisma.driverContact.delete({ where: { id: sourceId } }),
      // Now patch the target
      prisma.driverContact.update({ where: { id: targetId }, data: mergedPatch }),
    ]);
    const result = await prisma.driverContact.findUnique({ where: { id: targetId } });
    res.json({ driver: result, mergedFrom: sourceId });
  } catch (err: any) {
    if (err.code === 'P2002') {
      return res.status(409).json({
        error: 'Conflict',
        message: `Merge would create a duplicate on ${(err.meta?.target as string[])?.join(', ') ?? 'unique constraint'}`,
      });
    }
    throw err;
  }
});

router.post('/drivers', async (req: AuthRequest, res: Response) => {
  const orgId = req.auth!.orgId!;
  const parsed = DriverCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Bad Request', issues: parsed.error.issues });

  const phoneE164 = parsed.data.phoneE164 ? normalizePhone(parsed.data.phoneE164) : null;
  if (parsed.data.phoneE164 && !phoneE164) {
    return res.status(400).json({ error: 'Bad Request', message: 'Could not parse phone number to E.164. Include country code.' });
  }

  const prisma = getAppPrisma();
  try {
    const created = await prisma.driverContact.create({
      data: {
        clerkOrgId: orgId,
        displayName: parsed.data.displayName,
        normalizedName: normalizeName(parsed.data.displayName),
        phoneE164,
        motiveDriverId: parsed.data.motiveDriverId ?? null,
        source: DriverContactSource.MANUAL,
        enrolled: true,
      },
    });
    res.json({ driver: created });
  } catch (err: any) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Conflict', message: 'A driver with that name or phone already exists.' });
    }
    throw err;
  }
});

router.patch('/drivers/:id', async (req: AuthRequest, res: Response) => {
  const orgId = req.auth!.orgId!;
  const parsed = DriverUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Bad Request', issues: parsed.error.issues });

  let phoneE164: string | null | undefined = undefined;
  if (parsed.data.phoneE164 === null) phoneE164 = null;
  else if (parsed.data.phoneE164) {
    phoneE164 = normalizePhone(parsed.data.phoneE164);
    if (!phoneE164) {
      return res.status(400).json({ error: 'Bad Request', message: 'Could not parse phone number to E.164.' });
    }
  }

  const prisma = getAppPrisma();
  const existing = await prisma.driverContact.findFirst({
    where: { id: req.params.id, clerkOrgId: orgId },
  });
  if (!existing) return res.status(404).json({ error: 'Not Found' });

  const updated = await prisma.driverContact.update({
    where: { id: existing.id },
    data: {
      ...(parsed.data.displayName && {
        displayName: parsed.data.displayName,
        normalizedName: normalizeName(parsed.data.displayName),
      }),
      ...(phoneE164 !== undefined && { phoneE164 }),
      ...(parsed.data.motiveDriverId !== undefined && { motiveDriverId: parsed.data.motiveDriverId }),
      ...(parsed.data.whiparoundDriverId !== undefined && { whiparoundDriverId: parsed.data.whiparoundDriverId }),
      ...(parsed.data.email !== undefined && { email: parsed.data.email?.trim().toLowerCase() || null }),
      ...(parsed.data.enrolled !== undefined && { enrolled: parsed.data.enrolled }),
    },
  });
  res.json({ driver: updated });
});

router.delete('/drivers/:id', async (req: AuthRequest, res: Response) => {
  const orgId = req.auth!.orgId!;
  const prisma = getAppPrisma();
  const existing = await prisma.driverContact.findFirst({
    where: { id: req.params.id, clerkOrgId: orgId },
    select: { id: true },
  });
  if (!existing) return res.status(404).json({ error: 'Not Found' });
  await prisma.driverContact.update({
    where: { id: existing.id },
    data: { enrolled: false },
  });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Test send + Trigger now + History
// ---------------------------------------------------------------------------

router.post('/send-test', async (req: AuthRequest, res: Response) => {
  const orgId = req.auth!.orgId!;
  const parsed = SendTestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Bad Request', issues: parsed.error.issues });

  const phoneE164 = normalizePhone(parsed.data.phoneE164);
  if (!phoneE164) return res.status(400).json({ error: 'Bad Request', message: 'Invalid phone.' });

  const prisma = getAppPrisma();
  const built = await buildWeeklyReports(orgId);
  const sample = parsed.data.driverContactId
    ? built.reports.find((r) => r.driverContactId === parsed.data.driverContactId) ?? built.reports[0]
    : built.reports[0];

  if (!sample) {
    return res.status(409).json({
      error: 'No drivers',
      message: 'No drivers available to build a sample report. Sync Motive data and add drivers first.',
    });
  }

  const token = randomBytes(32).toString('hex');
  const reportUrl = `${config.reportPublicBaseUrl.replace(/\/$/, '')}/r/${token}`;
  const body = formatSmsBody({
    firstName: sample.firstName,
    noActivity: sample.noActivity,
    reportUrl,
  });

  await prisma.driverWeeklyReportSent.create({
    data: {
      clerkOrgId: orgId,
      driverContactId: sample.driverContactId,
      weekStartDate: `TEST-${built.weekStart}-${Date.now()}`,
      sentAt: new Date(),
      status: DriverSmsStatus.QUEUED,
      token,
      tokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      kpiSnapshot: {
        displayName: sample.displayName,
        firstName: sample.firstName,
        motiveScore: sample.motiveScore,
        rank: sample.rank,
        idleRank: sample.idleRank,
        safetyRank: sample.safetyRank,
        safetyTotal: sample.safetyTotal,
        totalDrivers: sample.totalDrivers,
        fleetAvgMpg: sample.fleetAvgMpg,
        current: sample.current,
        trend: sample.trend,
        trailing4WeekAvg: sample.trailing4WeekAvg,
        diffVsAvg: sample.diffVsAvg,
        noActivity: sample.noActivity,
      } as object,
      bodyPreview: body,
      isTest: true,
    },
  });

  const sendResult = await sendSms({ to: phoneE164, body });
  await prisma.driverWeeklyReportSent.update({
    where: { token },
    data: {
      status: sendResult.status === 'failed' ? DriverSmsStatus.FAILED : DriverSmsStatus.SENT,
      twilioSid: sendResult.sid,
      twilioErrorCode: sendResult.errorCode,
    },
  });

  res.json({
    ok: sendResult.status !== 'failed',
    bodyPreview: body,
    reportUrl,
    twilioSid: sendResult.sid,
    twilioStatus: sendResult.status,
    error: sendResult.errorMessage,
  });
});

router.post('/trigger-now', async (req: AuthRequest, res: Response) => {
  const orgId = req.auth!.orgId!;
  const dryRun = req.body?.dryRun === true;
  const summary = await runWeeklyDriverSms({
    onlyOrgId: orgId,
    ignoreSendHour: true,
    dryRun,
  });
  res.json({ summary });
});

router.get('/history', async (req: AuthRequest, res: Response) => {
  const orgId = req.auth!.orgId!;
  const weekStart = (req.query.weekStart as string | undefined) ?? undefined;
  const prisma = getAppPrisma();

  const rows = await prisma.driverWeeklyReportSent.findMany({
    where: { clerkOrgId: orgId, ...(weekStart && { weekStartDate: weekStart }) },
    orderBy: [{ weekStartDate: 'desc' }, { sentAt: 'desc' }],
    take: 500,
  });

  const driverIds = [...new Set(rows.map((r) => r.driverContactId))];
  const contacts = await prisma.driverContact.findMany({
    where: { id: { in: driverIds } },
    select: { id: true, displayName: true, phoneE164: true, optedOut: true },
  });
  const byId = new Map(contacts.map((c) => [c.id, c]));

  res.json({
    rows: rows.map((r) => ({
      id: r.id,
      driverContactId: r.driverContactId,
      driverName: byId.get(r.driverContactId)?.displayName ?? '(unknown)',
      driverPhone: byId.get(r.driverContactId)?.phoneE164 ?? null,
      optedOut: byId.get(r.driverContactId)?.optedOut ?? false,
      weekStartDate: r.weekStartDate,
      channel: r.channel,
      sentAt: r.sentAt,
      status: r.status,
      twilioSid: r.twilioSid,
      twilioErrorCode: r.twilioErrorCode,
      isTest: r.isTest,
      reportUrl: `${config.reportPublicBaseUrl.replace(/\/$/, '')}/r/${r.token}`,
      bodyPreview: r.bodyPreview,
    })),
  });
});

export default router;
