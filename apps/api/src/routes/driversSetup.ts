/**
 * Drivers Setup Admin Routes
 *
 * Lets internal admins control which Motive drivers are surfaced in this org's
 * portal. Mirrors the include/exclude pattern in `servicePlan.ts` for units.
 *
 * - GET    /admin/drivers-setup/drivers              — list MotiveDriverMaster rows + summary
 * - PUT    /admin/drivers-setup/drivers/:id/inclusion — toggle isIncluded for one driver
 * - POST   /admin/drivers-setup/sync                 — re-pull /v1/users from Motive
 */

import { Router } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { getAppPrisma } from '../lib/prisma.js';
import { readCredentials } from '../lib/credentials.js';
import { syncMotiveUsers } from '../telematics/motive/sync/syncMotiveUsers.js';

const router = Router();

// ---------------------------------------------------------------------------
// GET /admin/drivers-setup/drivers
// Returns all Motive drivers known for the org plus a summary.
// ---------------------------------------------------------------------------
router.get('/drivers', async (req: AuthRequest, res) => {
  try {
    const clerkOrgId = req.auth!.orgId!;
    const appPrisma = getAppPrisma();

    const drivers = await appPrisma.motiveDriverMaster.findMany({
      where: { clerkOrgId },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: {
        id: true,
        motiveDriverId: true,
        firstName: true,
        lastName: true,
        username: true,
        email: true,
        phone: true,
        status: true,
        isIncluded: true,
        lastSyncedAt: true,
      },
    });

    const total = drivers.length;
    const included = drivers.filter(d => d.isIncluded).length;
    const excluded = total - included;

    res.json({
      drivers,
      summary: { total, included, excluded },
    });
  } catch (err: any) {
    console.error('[driversSetup] GET /drivers error:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// ---------------------------------------------------------------------------
// PUT /admin/drivers-setup/drivers/:id/inclusion
// Toggle isIncluded for one driver. Body: { isIncluded: boolean }
// ---------------------------------------------------------------------------
router.put('/drivers/:id/inclusion', async (req: AuthRequest, res) => {
  try {
    const clerkOrgId = req.auth!.orgId!;
    const { id } = req.params;
    const { isIncluded } = req.body as { isIncluded: boolean };

    if (typeof isIncluded !== 'boolean') {
      return res.status(400).json({ error: 'isIncluded must be a boolean' });
    }

    const appPrisma = getAppPrisma();
    const existing = await appPrisma.motiveDriverMaster.findFirst({
      where: { id, clerkOrgId },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Not Found', message: 'Driver not found' });
    }

    const updated = await appPrisma.motiveDriverMaster.update({
      where: { id },
      data: { isIncluded },
    });

    res.json({ success: true, driver: updated });
  } catch (err: any) {
    console.error('[driversSetup] PUT /drivers/:id/inclusion error:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /admin/drivers-setup/sync
// Re-pulls /v1/users from Motive for the current org.
// ---------------------------------------------------------------------------
router.post('/sync', async (req: AuthRequest, res) => {
  try {
    const clerkOrgId = req.auth!.orgId!;
    const appPrisma = getAppPrisma();

    const account = await appPrisma.telematicsProviderAccount.findFirst({
      where: { clerkOrgId, provider: 'MOTIVE', status: 'ACTIVE' },
    });
    if (!account) {
      return res.status(409).json({
        error: 'NoMotiveAccount',
        message: 'This org has no active Motive provider account. Configure Motive credentials first.',
      });
    }

    const apiKey = readCredentials(account.credentialsJson).apiKey as string;
    if (!apiKey) {
      return res.status(409).json({
        error: 'MissingCredentials',
        message: 'Motive API key missing for this org.',
      });
    }

    const today = new Date().toISOString().slice(0, 10);
    const result = await syncMotiveUsers(clerkOrgId, apiKey, today);

    res.json({
      success: !result.skipped && result.errorCount === 0,
      result,
    });
  } catch (err: any) {
    console.error('[driversSetup] POST /sync error:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
});

export default router;
