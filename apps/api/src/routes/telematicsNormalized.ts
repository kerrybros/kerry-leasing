/**
 * NORMALIZED TELEMATICS ROUTES
 *
 * Provider-agnostic endpoints for telematics data.
 * The frontend calls these exclusively — no provider awareness needed on the client.
 *
 * Mounted at: /telematics/normalized
 *   GET /telematics/normalized/vehicle-utilization?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 *   GET /telematics/normalized/driver-utilization?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 */

import { Router } from 'express';
import { clerkAuthMiddleware, requireOrg, AuthRequest } from '../middleware/auth.js';
import { TelematicsService } from '../services/telematicsService.js';
import { getAppPrisma } from '../lib/prisma.js';
import { loadExcludedMotiveDriverIds } from '../features/drivers/excludedDrivers.js';

const router = Router();
const telematicsService = new TelematicsService();

function isValidDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(Date.parse(value));
}

/**
 * GET /telematics/normalized/vehicle-utilization
 * Query params: startDate (YYYY-MM-DD), endDate (YYYY-MM-DD)
 */
router.get(
  '/vehicle-utilization',
  clerkAuthMiddleware,
  requireOrg,
  async (req: AuthRequest, res) => {
    try {
      const rawStart = req.query.startDate;
      const rawEnd = req.query.endDate;

      const startDate = isValidDate(rawStart) ? rawStart : '2020-01-01';
      const endDate = isValidDate(rawEnd) ? rawEnd : new Date().toISOString().split('T')[0];

      if (startDate > endDate) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'startDate must be on or before endDate',
        });
      }

      const orgId = req.auth!.orgId!;
      const result = await telematicsService.getVehicleUtilization(orgId, startDate, endDate);

      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.setHeader('Vary', 'Authorization');
      res.json(result);
    } catch (error) {
      console.error('[Normalized] Error fetching vehicle utilization:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to fetch vehicle utilization data',
      });
    }
  }
);

/**
 * GET /telematics/normalized/driver-utilization
 * Query params: startDate (YYYY-MM-DD, optional), endDate (YYYY-MM-DD, optional)
 */
router.get(
  '/driver-utilization',
  clerkAuthMiddleware,
  requireOrg,
  async (req: AuthRequest, res) => {
    try {
      const rawStart = req.query.startDate;
      const rawEnd = req.query.endDate;

      const startDate = isValidDate(rawStart) ? rawStart : '2020-01-01';
      const endDate = isValidDate(rawEnd) ? rawEnd : new Date().toISOString().split('T')[0];

      if (startDate > endDate) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'startDate must be on or before endDate',
        });
      }

      const orgId = req.auth!.orgId!;
      const result = await telematicsService.getDriverUtilization(orgId, startDate, endDate);
      const excluded = await loadExcludedMotiveDriverIds(getAppPrisma(), orgId);
      // Build a new response — never mutate the (possibly cached) object.
      const payload = excluded.size > 0
        ? { ...result, data: result.data.filter(d => !excluded.has(d.driverId)) }
        : result;

      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.setHeader('Vary', 'Authorization');
      res.json(payload);
    } catch (error) {
      console.error('[Normalized] Error fetching driver utilization:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to fetch driver utilization data',
      });
    }
  }
);

/**
 * GET /telematics/normalized/driver-scorecard
 * Query params: startDate (YYYY-MM-DD, optional), endDate (YYYY-MM-DD, optional)
 *
 * Computes a weighted fleet-wide driver scorecard.
 * Currently Motive-only — returns empty data for Samsara orgs (no per-driver data yet).
 */
router.get(
  '/driver-scorecard',
  clerkAuthMiddleware,
  requireOrg,
  async (req: AuthRequest, res) => {
    try {
      const rawStart = req.query.startDate;
      const rawEnd = req.query.endDate;

      const startDate = isValidDate(rawStart) ? rawStart : '2020-01-01';
      const endDate = isValidDate(rawEnd) ? rawEnd : new Date().toISOString().split('T')[0];

      if (startDate > endDate) {
        return res.status(400).json({ error: 'Bad Request', message: 'startDate must be on or before endDate' });
      }

      const orgId = req.auth!.orgId!;
      const result = await telematicsService.getDriverScorecard(orgId, startDate, endDate);
      const excluded = await loadExcludedMotiveDriverIds(getAppPrisma(), orgId);
      // Build a new response — never mutate the (possibly cached) object.
      // Re-rank so the filtered leaderboard stays dense (1, 2, 3, …).
      const payload = excluded.size > 0
        ? {
            ...result,
            data: result.data
              .filter(d => !excluded.has(d.driverId))
              .map((d, idx) => ({ ...d, rank: idx + 1 })),
          }
        : result;

      res.setHeader('Cache-Control', 'private, max-age=300');
      res.setHeader('Vary', 'Authorization');
      res.json(payload);
    } catch (error) {
      console.error('[Normalized] Error fetching driver scorecard:', error);
      res.status(500).json({ error: 'Internal Server Error', message: 'Failed to compute driver scorecard' });
    }
  }
);

/**
 * POST /telematics/normalized/driver-safety-by-period
 * Body: { periods: [{ key, startDate, endDate }] }  (≤ 60 windows)
 *
 * Per-driver safety sub-score (same per-mile, Motive-weighted metric as the
 * scorecard) for each window — feeds the MoM/WoW trend grids.
 * Returns { [key]: { [driverId]: 0–100 } }.
 */
router.post(
  '/driver-safety-by-period',
  clerkAuthMiddleware,
  requireOrg,
  async (req: AuthRequest, res) => {
    try {
      const raw = (req.body?.periods ?? []) as unknown;
      if (!Array.isArray(raw) || raw.length === 0 || raw.length > 60) {
        return res.status(400).json({ error: 'Bad Request', message: 'periods must be a 1–60 item array' });
      }
      const periods: { key: string; startDate: string; endDate: string }[] = [];
      for (const p of raw) {
        const key = (p as any)?.key;
        const startDate = (p as any)?.startDate;
        const endDate = (p as any)?.endDate;
        if (typeof key !== 'string' || !isValidDate(startDate) || !isValidDate(endDate) || startDate > endDate) {
          return res.status(400).json({ error: 'Bad Request', message: 'invalid period entry' });
        }
        periods.push({ key, startDate, endDate });
      }

      const orgId = req.auth!.orgId!;
      const result = await telematicsService.getDriverSafetyByPeriod(orgId, periods);

      res.setHeader('Cache-Control', 'private, max-age=300');
      res.setHeader('Vary', 'Authorization');
      res.json(result);
    } catch (error) {
      console.error('[Normalized] Error fetching driver safety by period:', error);
      res.status(500).json({ error: 'Internal Server Error', message: 'Failed to compute driver safety by period' });
    }
  }
);

export default router;
