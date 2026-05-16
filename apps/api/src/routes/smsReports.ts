/**
 * FLEET-USER SMS REPORTS
 *
 * Fleet admin endpoints for the Weekly SMS Preview tab on /app/drivers.
 *
 *   GET  /sms-reports/weeks       — list of selectable weeks (upcoming + past sends)
 *   GET  /sms-reports/preview     — full one-pager data for every eligible driver in
 *                                   the week, sorted by rank (top performer first).
 *                                   Same snapshot shape as /r/<token> so the same
 *                                   React renderer works in both places.
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { getAppPrisma } from '../lib/prisma.js';
import { AuthRequest } from '../middleware/auth.js';
import { config } from '../config.js';
import { buildWeeklyReports } from '../features/smsWeeklyReports/weeklyReportBuilder.js';
import { getLastWeekRange } from '../features/smsWeeklyReports/dateWindow.js';

const router = Router();

/**
 * GET /sms-reports/weeks
 * Returns the list of week-starts available for preview, newest first:
 *   - the upcoming Monday's send (built on-the-fly when requested)
 *   - every past week where DriverWeeklyReportSent rows exist
 */
router.get('/weeks', async (req: AuthRequest, res: Response) => {
  const orgId = req.auth!.orgId!;
  const prisma = getAppPrisma();

  const cfg = await prisma.customerSmsReportConfig.findUnique({ where: { clerkOrgId: orgId } });
  const upcoming = getLastWeekRange(new Date());

  const pastRows = await prisma.driverWeeklyReportSent.groupBy({
    by: ['weekStartDate'],
    where: { clerkOrgId: orgId, isTest: false },
    _count: { _all: true },
    orderBy: { weekStartDate: 'desc' },
  });

  const weeks = [
    { weekStart: upcoming.startDate, weekEnd: upcoming.endDate, isUpcoming: true, sendCount: 0 },
    ...pastRows
      .filter((r) => r.weekStartDate !== upcoming.startDate && !r.weekStartDate.startsWith('TEST-'))
      .map((r) => ({
        weekStart: r.weekStartDate,
        weekEnd: '',
        isUpcoming: false,
        sendCount: r._count._all,
      })),
  ];

  res.json({ enabled: cfg?.enabled ?? false, sendHourEt: cfg?.sendHourEt ?? 5, weeks });
});

/**
 * GET /sms-reports/preview?weekStart=YYYY-MM-DD
 * Returns rank-ordered drivers with full one-pager snapshots.
 *
 * Driver scope: enrolled, non-opted-out drivers with a phone. Sorted by rank
 * (top performer first) — matches what the Monday cron would target and
 * surfaces leaderboard order for the fleet admin glance.
 *
 * Snapshot shape matches what /r/<token> returns so the same React
 * component renders both the public mobile page and the inline preview.
 */
const PreviewQuerySchema = z.object({ weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
router.get('/preview', async (req: AuthRequest, res: Response) => {
  const orgId = req.auth!.orgId!;
  const parsed = PreviewQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Bad Request', issues: parsed.error.issues });
  }

  const prisma = getAppPrisma();
  const upcoming = getLastWeekRange(new Date());
  const isUpcoming = parsed.data.weekStart === upcoming.startDate;

  if (isUpcoming) {
    let built;
    try {
      built = await buildWeeklyReports(orgId);
    } catch (err: any) {
      return res.status(500).json({ error: 'Failed to build preview', message: err.message });
    }

    // Exclude only the unreachable (no phone or opted-out). Keep
    // !enrolled drivers in the response so the fleet admin can see who's
    // currently excluded and toggle them back on.
    const reachable = built.reports
      .filter((r) => !r.optedOut && r.phoneE164 != null)
      .sort((a, b) => a.rank - b.rank);

    // Fetch email per driver in one query (snapshot doesn't carry it).
    const contactRows = await prisma.driverContact.findMany({
      where: { id: { in: reachable.map((r) => r.driverContactId).filter(Boolean) } },
      select: { id: true, email: true },
    });
    const emailById = new Map(contactRows.map((c) => [c.id, c.email]));

    const drivers = reachable.map((r) => ({
      driverContactId: r.driverContactId,
      driverName: r.displayName,
      phoneE164: r.phoneE164,
      email: emailById.get(r.driverContactId) ?? null,
      enrolled: r.enrolled,
      smsBodyPreview: `Hi ${r.firstName}, you ranked ${r.rank} of ${r.totalDrivers} this week. Full scorecard: ${config.reportPublicBaseUrl.replace(/\/$/, '')}/r/<token>`,
      snapshot: {
        displayName: r.displayName,
        firstName: r.firstName,
        rank: r.rank,
        totalDrivers: r.totalDrivers,
        fleetAvgMpg: r.fleetAvgMpg,
        noActivity: r.noActivity,
        current: r.current,
        trend: r.trend,
        trailing4WeekAvg: r.trailing4WeekAvg,
        diffVsAvg: r.diffVsAvg,
      },
    }));

    return res.json({
      weekStart: upcoming.startDate,
      weekEnd: upcoming.endDate,
      isUpcoming: true,
      drivers,
    });
  }

  // Past week — read frozen snapshots from DriverWeeklyReportSent rows.
  const rows = await prisma.driverWeeklyReportSent.findMany({
    where: { clerkOrgId: orgId, weekStartDate: parsed.data.weekStart, isTest: false },
    orderBy: { sentAt: 'desc' },
  });
  const contactIds = [...new Set(rows.map((r) => r.driverContactId))];
  const contacts = await prisma.driverContact.findMany({
    where: { id: { in: contactIds } },
    select: { id: true, displayName: true, email: true, phoneE164: true, enrolled: true, optedOut: true },
  });
  const byId = new Map(contacts.map((c) => [c.id, c]));

  const drivers = rows
    .map((r) => {
      const c = byId.get(r.driverContactId);
      // Past-week view: keep showing rows even if enrollment was toggled
      // off later — so admin can see the historical send list.
      if (!c || c.optedOut || !c.phoneE164) return null;
      const snap = (r.kpiSnapshot ?? {}) as any;
      return {
        driverContactId: r.driverContactId,
        driverName: c.displayName,
        phoneE164: c.phoneE164,
        email: c.email,
        enrolled: c.enrolled,
        smsBodyPreview: r.bodyPreview,
        status: r.status,
        sentAt: r.sentAt,
        reportUrl: `${config.reportPublicBaseUrl.replace(/\/$/, '')}/r/${r.token}`,
        snapshot: {
          displayName: snap.displayName ?? c.displayName,
          firstName: snap.firstName,
          rank: snap.rank,
          totalDrivers: snap.totalDrivers,
          fleetAvgMpg: snap.fleetAvgMpg,
          noActivity: snap.noActivity,
          current: snap.current ?? null,
          trend: snap.trend ?? [],
          trailing4WeekAvg: snap.trailing4WeekAvg ?? null,
          diffVsAvg: snap.diffVsAvg ?? null,
        },
      };
    })
    .filter((d): d is NonNullable<typeof d> => d != null)
    .sort((a, b) => (a.snapshot.rank ?? 999) - (b.snapshot.rank ?? 999));

  res.json({
    weekStart: parsed.data.weekStart,
    weekEnd: '',
    isUpcoming: false,
    drivers,
  });
});

/**
 * PATCH /sms-reports/drivers/:id/enrollment
 * Fleet-scoped toggle: include or exclude this driver from future Monday
 * sends. Wraps a single boolean update on DriverContact.enrolled.
 */
const EnrollmentSchema = z.object({ enrolled: z.boolean() });
router.patch('/drivers/:id/enrollment', async (req: AuthRequest, res: Response) => {
  const orgId = req.auth!.orgId!;
  const parsed = EnrollmentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Bad Request', issues: parsed.error.issues });
  }
  const prisma = getAppPrisma();
  const existing = await prisma.driverContact.findFirst({
    where: { id: req.params.id, clerkOrgId: orgId },
    select: { id: true },
  });
  if (!existing) return res.status(404).json({ error: 'Not Found' });
  const updated = await prisma.driverContact.update({
    where: { id: existing.id },
    data: { enrolled: parsed.data.enrolled },
    select: { id: true, enrolled: true },
  });
  res.json({ driver: updated });
});

export default router;
