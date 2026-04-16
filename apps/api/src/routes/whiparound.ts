/**
 * WHIP AROUND DATA ROUTES
 * Read-only endpoints returning persisted inspection and defect data for the
 * authenticated org. Data is populated by the whiparound sync cron.
 *
 * Mounted at: /whiparound
 */

import { Router } from 'express';
import { clerkAuthMiddleware, requireOrg, AuthRequest } from '../middleware/auth.js';
import { getAppPrisma } from '../lib/prisma.js';

const router = Router();

router.use(clerkAuthMiddleware);
router.use(requireOrg);

// ---------------------------------------------------------------------------
// GET /whiparound/defects
// Returns defects for the authenticated org.
// Query params:
//   status       — filter by status string (e.g. "new", "in_progress", "corrected")
//   teamId       — filter by numeric team id
//   defectType   — filter by defect_type string
//   priority     — filter by defect_priority string
//   search       — partial match on defect_ref, asset_name, defect_name, description
//   limit        — max records (default 500, max 1000)
//   offset       — for pagination
// ---------------------------------------------------------------------------
router.get('/defects', async (req: AuthRequest, res) => {
  try {
    const clerkOrgId = req.auth!.orgId!;
    const {
      status,
      teamId,
      defectType,
      priority,
      search,
      limit: limitRaw,
      offset: offsetRaw,
    } = req.query as Record<string, string | undefined>;

    const limit = Math.min(Number(limitRaw) || 500, 1000);
    const offset = Number(offsetRaw) || 0;

    const appPrisma = getAppPrisma();

    // Build where clause
    const where: Record<string, unknown> = { clerkOrgId };
    if (status) where.status = status;
    if (teamId) where.teamId = Number(teamId);
    if (defectType) where.defectType = defectType;
    if (priority) where.defectPriority = priority;
    if (search) {
      const term = search.trim();
      where.OR = [
        { defectRef: { contains: term, mode: 'insensitive' } },
        { assetName: { contains: term, mode: 'insensitive' } },
        { defectName: { contains: term, mode: 'insensitive' } },
        { description: { contains: term, mode: 'insensitive' } },
      ];
    }

    const [defectRows, total] = await Promise.all([
      appPrisma.whiparoundDefect.findMany({
        where,
        orderBy: { defectCreatedAt: 'desc' },
        take: limit,
        skip: offset,
        select: {
          id: true,
          whiparoundId: true,
          defectRef: true,
          inspectionId: true,
          assetId: true,
          assetName: true,
          teamId: true,
          teamName: true,
          driverName: true,
          defectName: true,
          description: true,
          status: true,
          defectPriority: true,
          defectType: true,
          severity: true,
          repeatedTimes: true,
          assignee: true,
          workOrder: true,
          defectSource: true,
          createdBy: true,
          defectCreatedAt: true,
          defectUpdatedAt: true,
        },
      }),
      appPrisma.whiparoundDefect.count({ where }),
    ]);

    const inspectionIds = [
      ...new Set(
        defectRows
          .map((d) => d.inspectionId)
          .filter((id): id is number => id != null)
      ),
    ];

    const inspectionByWaId = new Map<
      number,
      {
        whiparoundId: number;
        driverName: string | null;
        inspectedAt: Date;
        durationSec: number | null;
        passed: boolean | null;
        pdfUrl: string | null;
      }
    >();

    if (inspectionIds.length > 0) {
      const inspections = await appPrisma.whiparoundInspection.findMany({
        where: { clerkOrgId, whiparoundId: { in: inspectionIds } },
        select: {
          whiparoundId: true,
          driverName: true,
          inspectedAt: true,
          durationSec: true,
          passed: true,
          pdfUrl: true,
        },
      });
      for (const i of inspections) inspectionByWaId.set(i.whiparoundId, i);
    }

    const defects = defectRows.map((d) => ({
      ...d,
      inspection:
        d.inspectionId != null
          ? inspectionByWaId.get(d.inspectionId) ?? null
          : null,
    }));

    // Status counts for tab badges
    const statusCounts = await appPrisma.whiparoundDefect.groupBy({
      by: ['status'],
      where: { clerkOrgId },
      _count: { id: true },
    });
    const counts: Record<string, number> = {};
    let totalAll = 0;
    for (const row of statusCounts) {
      const key = row.status ?? 'unknown';
      counts[key] = row._count.id;
      totalAll += row._count.id;
    }
    counts.all = totalAll;

    res.json({ defects, total, limit, offset, statusCounts: counts });
  } catch (error: any) {
    console.error('Error fetching Whip Around defects:', error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
});

// ---------------------------------------------------------------------------
// GET /whiparound/inspections
// Returns inspections for the authenticated org.
// Query params:
//   from    — ISO date string (inclusive)
//   to      — ISO date string (inclusive)
//   assetId — filter by numeric asset id
//   passed  — "true" | "false"
//   limit   — default 200, max 1000
//   offset
// ---------------------------------------------------------------------------
router.get('/inspections', async (req: AuthRequest, res) => {
  try {
    const clerkOrgId = req.auth!.orgId!;
    const {
      from,
      to,
      assetId,
      passed,
      limit: limitRaw,
      offset: offsetRaw,
    } = req.query as Record<string, string | undefined>;

    const limit = Math.min(Number(limitRaw) || 200, 1000);
    const offset = Number(offsetRaw) || 0;

    const appPrisma = getAppPrisma();

    const where: Record<string, unknown> = { clerkOrgId };
    if (from || to) {
      const range: Record<string, Date> = {};
      if (from) range.gte = new Date(from);
      if (to) range.lte = new Date(to);
      where.inspectedAt = range;
    }
    if (assetId) where.assetId = Number(assetId);
    if (passed !== undefined) where.passed = passed === 'true';

    const [inspections, total] = await Promise.all([
      appPrisma.whiparoundInspection.findMany({
        where,
        orderBy: { inspectedAt: 'desc' },
        take: limit,
        skip: offset,
        select: {
          id: true,
          whiparoundId: true,
          driverId: true,
          driverName: true,
          assetId: true,
          teamId: true,
          formId: true,
          completion: true,
          passed: true,
          pdfUrl: true,
          durationSec: true,
          inspectedAt: true,
          endedOnDeviceAt: true,
        },
      }),
      appPrisma.whiparoundInspection.count({ where }),
    ]);

    res.json({ inspections, total, limit, offset });
  } catch (error: any) {
    console.error('Error fetching Whip Around inspections:', error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
});

// ---------------------------------------------------------------------------
// GET /whiparound/sync-status
// Returns the sync account status for the authenticated org.
// ---------------------------------------------------------------------------
router.get('/sync-status', async (req: AuthRequest, res) => {
  try {
    const clerkOrgId = req.auth!.orgId!;
    const appPrisma = getAppPrisma();

    const account = await appPrisma.whiparoundAccount.findUnique({
      where: { clerkOrgId },
      select: {
        status: true,
        lastSyncAt: true,
        lastError: true,
        updatedAt: true,
      },
    });

    if (!account) {
      return res.json({ configured: false, lastSyncAt: null, lastError: null });
    }

    res.json({
      configured: true,
      status: account.status,
      lastSyncAt: account.lastSyncAt,
      lastError: account.lastError,
      updatedAt: account.updatedAt,
    });
  } catch (error: any) {
    console.error('Error fetching Whip Around sync status:', error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
});

export default router;
