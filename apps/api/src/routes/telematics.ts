/**
 * TELEMATICS API ROUTES
 * 
 * Endpoints for telematics data access and configuration
 * All tenant-scoped endpoints require Clerk auth + org context
 * Admin endpoints require internal role
 */

import { Router } from 'express';
import {
  clerkAuthMiddleware,
  requireOrg,
  requireRole,
  AuthRequest,
} from '../middleware/auth.js';
import { getAppClient } from '../db/appRepo.js';
import { syncOrgForDate, syncAllOrgsForDate, getYesterdayToronto } from '../telematics/syncTelematics.js';
import { validateCredentials } from '../telematics/providers/index.js';
import { TelematicsProvider, TelematicsProviderStatus } from '../telematics/types.js';
import { TtlCache } from '../lib/ttlCache.js';

const router = Router();
const TEN_HOURS_MS = 10 * 60 * 60 * 1000;
    const telematicsCache = new TtlCache<any>(TEN_HOURS_MS, 300); // Cache update forced for migration

/**
 * GET /telematics/daily
 * 
 * Fetch normalized daily telematics metrics
 * Tenant-scoped to authenticated org
 * 
 * Query params:
 *   vin (optional) - Filter by specific VIN
 *   from (required) - Start date YYYY-MM-DD
 *   to (required) - End date YYYY-MM-DD
 */
router.get(
  '/daily',
  clerkAuthMiddleware,
  requireOrg,
  async (req: AuthRequest, res) => {
    try {
      const startedAt = Date.now();
      const fetchedAt = new Date().toISOString();
      const orgId = req.auth!.orgId!;
      const { vin, from, to } = req.query;

      // Validate dates
      if (!from || !to) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Both "from" and "to" date parameters are required (YYYY-MM-DD format)',
        });
      }

      const appClient = getAppClient();

      // Build where clause
      const where: any = {
        clerkOrgId: orgId,
        date: {
          gte: from as string,
          lte: to as string,
        },
      };

      if (vin) {
        where.vin = vin as string;
      }

      const cacheKey = `telematics:daily:${orgId}:${String(vin || '')}:${String(from)}:${String(to)}`;
      const { value: metrics, hit } = await telematicsCache.getOrSet(cacheKey, async () => {
        return await appClient.telematicsDailyMetric.findMany({
          where,
          orderBy: [{ date: 'desc' }, { vin: 'asc' }],
        });
      });

      const elapsedMs = Date.now() - startedAt;
      console.log('[Telematics] GET /telematics/daily', {
        fetchedAt,
        orgId,
        vin: vin || null,
        from,
        to,
        rows: Array.isArray(metrics) ? metrics.length : 0,
        cache: hit ? 'HIT' : 'MISS',
        elapsedMs,
      });

      res.setHeader('Cache-Control', 'private, max-age=36000');
      res.setHeader('X-Cache', hit ? 'HIT' : 'MISS');
      res.setHeader('X-Elapsed-Ms', String(elapsedMs));

      // Return metrics directly as array (frontend expects this format)
      res.json(metrics);
    } catch (error) {
      console.error('Error fetching telematics daily:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to fetch telematics data',
      });
    }
  }
);

/**
 * GET /telematics/summary
 * 
 * Get aggregated metrics for org on a specific date or date range
 * Tenant-scoped to authenticated org
 * 
 * Query params:
 *   from (required) - Start date YYYY-MM-DD
 *   to (required) - End date YYYY-MM-DD
 */
router.get(
  '/summary',
  clerkAuthMiddleware,
  requireOrg,
  async (req: AuthRequest, res) => {
    try {
      const startedAt = Date.now();
      const fetchedAt = new Date().toISOString();
      const orgId = req.auth!.orgId!;
      const { from, to } = req.query;

      if (!from || !to) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Both "from" and "to" date parameters are required (YYYY-MM-DD format)',
        });
      }

      const appClient = getAppClient();

      const cacheKey = `telematics:summary:${orgId}:${String(from)}:${String(to)}`;
      const { value: metrics, hit } = await telematicsCache.getOrSet(cacheKey, async () => {
        return await appClient.telematicsDailyMetric.findMany({
          where: {
            clerkOrgId: orgId,
            date: {
              gte: from as string,
              lte: to as string,
            },
          },
        });
      });

      // Calculate aggregates
      const summary = {
        period: `${from} to ${to}`,
        vehicleCount: new Set(metrics.map(m => m.vin)).size,
        totalMiles: 0,
        totalIdleMinutes: 0,
        totalFuelGallons: 0,
        avgMpg: 0,
      };

      let mpgCount = 0;

      for (const metric of metrics) {
        if (metric.milesDriven) summary.totalMiles += metric.milesDriven;
        if (metric.idleMinutes) summary.totalIdleMinutes += metric.idleMinutes;
        if (metric.fuelGallons) summary.totalFuelGallons += metric.fuelGallons;
        if (metric.avgMpg) {
          summary.avgMpg += metric.avgMpg;
          mpgCount++;
        }
      }

      // Average MPG
      if (mpgCount > 0) {
        summary.avgMpg = summary.avgMpg / mpgCount;
      }

      const elapsedMs = Date.now() - startedAt;
      console.log('[Telematics] GET /telematics/summary', {
        fetchedAt,
        orgId,
        from,
        to,
        rows: Array.isArray(metrics) ? metrics.length : 0,
        cache: hit ? 'HIT' : 'MISS',
        elapsedMs,
      });

      res.setHeader('Cache-Control', 'private, max-age=36000');
      res.setHeader('X-Cache', hit ? 'HIT' : 'MISS');
      res.setHeader('X-Elapsed-Ms', String(elapsedMs));
      res.json(summary);
    } catch (error) {
      console.error('Error fetching telematics summary:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to fetch telematics summary',
      });
    }
  }
);

/**
 * POST /admin/telematics/configure
 * 
 * Configure telematics provider for an organization
 * Internal/admin only
 */
router.post(
  '/admin/telematics/configure',
  clerkAuthMiddleware,
  requireRole(['internal']),
  async (req: AuthRequest, res) => {
    try {
      const { clerkOrgId, provider, credentials } = req.body;

      // Validate inputs
      if (!clerkOrgId || !provider || !credentials) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'clerkOrgId, provider, and credentials are required',
        });
      }

      // Validate provider enum
      if (!Object.values(TelematicsProvider).includes(provider)) {
        return res.status(400).json({
          error: 'Bad Request',
          message: `Invalid provider. Must be one of: ${Object.values(TelematicsProvider).join(', ')}`,
        });
      }

      // Validate credentials structure
      if (!validateCredentials(provider, credentials)) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Invalid credentials format for provider',
        });
      }

      const appClient = getAppClient();

      // Check if org already has a provider configured
      const existing = await appClient.telematicsProviderAccount.findUnique({
        where: { clerkOrgId },
      });

      if (existing && existing.provider !== provider) {
        return res.status(409).json({
          error: 'Conflict',
          message: `Organization already configured with ${existing.provider}. Delete existing configuration first.`,
        });
      }

      // Upsert provider account
      const account = await appClient.telematicsProviderAccount.upsert({
        where: { clerkOrgId },
        create: {
          clerkOrgId,
          provider,
          credentialsJson: credentials,
          status: TelematicsProviderStatus.ACTIVE,
        },
        update: {
          credentialsJson: credentials,
          status: TelematicsProviderStatus.ACTIVE,
          lastError: null,
        },
      });

      res.json({
        success: true,
        account: {
          clerkOrgId: account.clerkOrgId,
          provider: account.provider,
          status: account.status,
          createdAt: account.createdAt,
          updatedAt: account.updatedAt,
        },
      });
    } catch (error) {
      console.error('Error configuring telematics:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to configure telematics provider',
      });
    }
  }
);

/**
 * POST /admin/telematics/vehicle-map
 * 
 * Add/update vehicle mapping (providerVehicleId -> VIN)
 * Internal/admin only
 */
router.post(
  '/admin/telematics/vehicle-map',
  clerkAuthMiddleware,
  requireRole(['internal']),
  async (req: AuthRequest, res) => {
    try {
      const { clerkOrgId, provider, providerVehicleId, vin, providerVehicleName } = req.body;

      if (!clerkOrgId || !provider || !providerVehicleId || !vin) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'clerkOrgId, provider, providerVehicleId, and vin are required',
        });
      }

      const appClient = getAppClient();

      const mapping = await appClient.telematicsVehicleMap.upsert({
        where: {
          clerkOrgId_provider_providerVehicleId: {
            clerkOrgId,
            provider,
            providerVehicleId,
          },
        },
        create: {
          clerkOrgId,
          provider,
          providerVehicleId,
          vin,
          providerVehicleName,
        },
        update: {
          vin,
          providerVehicleName,
        },
      });

      res.json({
        success: true,
        mapping,
      });
    } catch (error) {
      console.error('Error creating vehicle mapping:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to create vehicle mapping',
      });
    }
  }
);

/**
 * POST /admin/telematics/sync
 * 
 * Trigger telematics sync for all orgs or specific date
 * Internal/admin only
 */
router.post(
  '/admin/telematics/sync',
  clerkAuthMiddleware,
  requireRole(['internal']),
  async (req: AuthRequest, res) => {
    try {
      const { date } = req.body;
      const syncDate = date || getYesterdayToronto();

      // Validate date format if provided
      if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Date must be in YYYY-MM-DD format',
        });
      }

      // Run sync asynchronously
      console.log(`Manual sync triggered for ${syncDate} by ${req.auth?.userId}`);
      
      const results = await syncAllOrgsForDate(syncDate);

      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;
      const totalMetrics = results.reduce((sum, r) => sum + r.metricsCount, 0);

      res.json({
        success: true,
        date: syncDate,
        summary: {
          total: results.length,
          success: successCount,
          failed: failCount,
          totalMetrics,
        },
        results: results.map(r => ({
          clerkOrgId: r.clerkOrgId,
          provider: r.provider,
          success: r.success,
          metricsCount: r.metricsCount,
          error: r.error,
        })),
      });
    } catch (error) {
      console.error('Error triggering sync:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to trigger sync',
      });
    }
  }
);

// GET /telematics/motive/vehicle-utilization
// Returns raw Motive vehicle utilization data for the org
router.get(
  '/motive/vehicle-utilization',
  clerkAuthMiddleware,
  requireOrg,
  async (req: AuthRequest, res) => {
    try {
      const startedAt = Date.now();
      const fetchedAt = new Date().toISOString();
      const orgId = req.auth!.orgId!;
      const appClient = getAppClient();

      const cacheKey = `telematics:motive:vehicle-utilization:${orgId}`;
      const { value: records, hit } = await telematicsCache.getOrSet(cacheKey, async () => {
        return await appClient.motiveVehicleUtilization.findMany({
          where: { clerkOrgId: orgId },
          orderBy: [{ date: 'desc' }, { vehicleId: 'asc' }],
        });
      });

      const elapsedMs = Date.now() - startedAt;
      console.log('[Telematics] GET /telematics/motive/vehicle-utilization', {
        fetchedAt,
        orgId,
        rows: Array.isArray(records) ? records.length : 0,
        cache: hit ? 'HIT' : 'MISS',
        elapsedMs,
      });

      res.setHeader('Cache-Control', 'private, max-age=36000');
      res.setHeader('X-Cache', hit ? 'HIT' : 'MISS');
      res.setHeader('X-Elapsed-Ms', String(elapsedMs));
      res.json(records);
    } catch (error) {
      console.error('Error fetching vehicle utilization:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to fetch vehicle utilization data',
      });
    }
  }
);

// GET /telematics/motive/driver-utilization
// Returns raw Motive driver utilization data for the org
router.get(
  '/motive/driver-utilization',
  clerkAuthMiddleware,
  requireOrg,
  async (req: AuthRequest, res) => {
    try {
      const startedAt = Date.now();
      const fetchedAt = new Date().toISOString();
      const orgId = req.auth!.orgId!;
      const appClient = getAppClient();

      const cacheKey = `telematics:motive:driver-utilization:${orgId}`;
      const { value: records, hit } = await telematicsCache.getOrSet(cacheKey, async () => {
        return await appClient.motiveDriverUtilization.findMany({
          where: { clerkOrgId: orgId },
          orderBy: [{ date: 'desc' }, { driverId: 'asc' }],
        });
      });

      const elapsedMs = Date.now() - startedAt;
      console.log('[Telematics] GET /telematics/motive/driver-utilization', {
        fetchedAt,
        orgId,
        rows: Array.isArray(records) ? records.length : 0,
        cache: hit ? 'HIT' : 'MISS',
        elapsedMs,
      });

      res.setHeader('Cache-Control', 'private, max-age=36000');
      res.setHeader('X-Cache', hit ? 'HIT' : 'MISS');
      res.setHeader('X-Elapsed-Ms', String(elapsedMs));
      res.json(records);
    } catch (error) {
      console.error('Error fetching driver utilization:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to fetch driver utilization data',
      });
    }
  }
);

export default router;
