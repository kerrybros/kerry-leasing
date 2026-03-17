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
import { requireProvider } from '../middleware/providerValidation.js';
import { getAppPrisma } from '../lib/prisma.js';
import { getSamsaraIdleAggregatesByDate } from '../telematics/samsara/idleAggregates.js';
import { TelematicsProvider, TelematicsProviderStatus } from '../telematics/types.js';
import { TtlCache } from '../lib/ttlCache.js';
import { syncMotiveOrgForDate } from '../telematics/motive/syncService.js';
import { syncSamsaraOrgForDate } from '../telematics/samsara/syncService.js';
import { getYesterday } from '../telematics/dates.js';
import { encryptCredentials, readCredentials } from '../lib/credentials.js';
import {
  ConfigureTelematicsSchema,
  VehicleMapSchema,
  AdminSyncSchema,
  BackdateTelematicsSchema,
  SyncDateSchema,
  PaginationSchema,
  parseBody,
  parseQuery,
} from '../lib/validate.js';
import { backdateMotiveData } from '../telematics/motive/backdate.js';
import { backdateSamsaraData } from '../telematics/samsara/backdate.js';

const router = Router();
const TEN_HOURS_MS = 10 * 60 * 60 * 1000;
const telematicsCache = new TtlCache<any>(TEN_HOURS_MS, 300);

/**
 * POST /admin/telematics/clear-cache
 *
 * Clear in-memory telematics cache (vehicle-utilization, driver-utilization, vehicle-stats).
 * Call this after wiping telematics data or when you need the UI to reflect fresh DB state
 * without restarting the API. Internal/admin only.
 */
router.post(
  '/admin/telematics/clear-cache',
  clerkAuthMiddleware,
  requireRole(['internal']),
  (req, res) => {
    telematicsCache.clear();
    console.log('[Telematics] Cache cleared (all orgs)');
    res.json({ ok: true, message: 'Telematics cache cleared' });
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
      const body = parseBody(ConfigureTelematicsSchema, req, res);
      if (!body) return;
      const { clerkOrgId, provider, credentials } = body;

      const appClient = getAppPrisma();

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

      // Encrypt credentials before storing
      let storedCredentials: string | Record<string, unknown>;
      try {
        storedCredentials = encryptCredentials(credentials as Record<string, unknown>);
      } catch {
        // Encryption key not configured — store plaintext with a warning
        console.warn('[Telematics] CREDENTIALS_ENCRYPTION_KEY not set; storing credentials as plaintext');
        storedCredentials = credentials;
      }

      // Upsert provider account
      const account = await appClient.telematicsProviderAccount.upsert({
        where: { clerkOrgId },
        create: {
          clerkOrgId,
          provider,
          credentialsJson: storedCredentials as never,
          status: TelematicsProviderStatus.ACTIVE,
        },
        update: {
          credentialsJson: storedCredentials as never,
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
      const body = parseBody(VehicleMapSchema, req, res);
      if (!body) return;
      const { clerkOrgId, provider, providerVehicleId, vin, providerVehicleName } = body;

      const appClient = getAppPrisma();

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
 * Trigger manual telematics sync for all orgs or specific date
 * Internal/admin only
 * 
 * Body params:
 *   date (optional) - YYYY-MM-DD date to sync (defaults to yesterday)
 *   provider (optional) - Filter to specific provider (MOTIVE or SAMSARA)
 */
router.post(
  '/admin/telematics/sync',
  clerkAuthMiddleware,
  requireRole(['internal']),
  async (req: AuthRequest, res) => {
    try {
      const body = parseBody(AdminSyncSchema, req, res);
      if (!body) return;
      const { date, provider } = body;
      const syncDate = date || getYesterday();

      console.log(`Manual sync triggered for ${syncDate} by ${req.auth?.userId}`);

      const appClient = getAppPrisma();

      const where: any = { status: TelematicsProviderStatus.ACTIVE };
      if (provider) {
        where.provider = provider;
      }
      
      const accounts = await appClient.telematicsProviderAccount.findMany({ where });

      console.log(`Found ${accounts.length} active accounts to sync`);

      // Run syncs with concurrency cap of 5 to avoid HTTP timeout
      const CONCURRENCY = 5;
      const allResults: any[] = [];

      async function syncAccount(account: typeof accounts[0]): Promise<void> {
        try {
          let result: any;
          if (account.provider === TelematicsProvider.MOTIVE) {
            const apiKey = readCredentials(account.credentialsJson).apiKey as string;
            result = await syncMotiveOrgForDate(account.clerkOrgId, apiKey, syncDate, false);
          } else if (account.provider === TelematicsProvider.SAMSARA) {
            const apiToken = readCredentials(account.credentialsJson).apiToken as string;
            result = await syncSamsaraOrgForDate(account.clerkOrgId, apiToken, syncDate, false);
          } else {
            throw new Error(`Unsupported provider: ${account.provider}`);
          }
          allResults.push({ clerkOrgId: account.clerkOrgId, provider: account.provider, success: result.success, date: syncDate });
        } catch (error: any) {
          allResults.push({ clerkOrgId: account.clerkOrgId, provider: account.provider, success: false, error: error.message, date: syncDate });
        }
      }

      // Process in chunks of CONCURRENCY
      for (let i = 0; i < accounts.length; i += CONCURRENCY) {
        const chunk = accounts.slice(i, i + CONCURRENCY);
        await Promise.allSettled(chunk.map(syncAccount));
      }

      const successCount = allResults.filter((r) => r.success).length;
      const failCount = allResults.filter((r) => !r.success).length;

      res.json({
        success: true,
        date: syncDate,
        summary: { total: allResults.length, success: successCount, failed: failCount },
        results: allResults,
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

/**
 * POST /admin/telematics/backdate
 *
 * Start a background backdate of telematics data from startDate to endDate for the current org.
 * Defaults: startDate = contract start date from RepairCustomerConfig, endDate = yesterday.
 * Fire-and-forget: returns immediately; job runs in background.
 * Internal/admin only; requires org context.
 */
router.post(
  '/admin/telematics/backdate',
  clerkAuthMiddleware,
  requireOrg,
  requireRole(['internal']),
  async (req: AuthRequest, res) => {
    try {
      const body = parseBody(BackdateTelematicsSchema, req, res);
      if (!body) return;
      const orgId = req.auth!.orgId!;
      const appClient = getAppPrisma();

      const repairConfig = await appClient.repairCustomerConfig.findUnique({
        where: { klOrgId: orgId },
        select: { contractStartDate: true },
      });
      const contractStartStr = repairConfig?.contractStartDate
        ? repairConfig.contractStartDate.toISOString().split('T')[0]
        : null;

      const startDate = body.startDate ?? contractStartStr;
      const endDate = body.endDate ?? getYesterday();

      if (!startDate) {
        return res.status(409).json({
          error: 'Conflict',
          message: 'No contract start date configured. Set it in Org Settings or pass startDate in the request.',
        });
      }
      if (startDate > endDate) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'startDate must be on or before endDate',
        });
      }

      const providerAccount = await appClient.telematicsProviderAccount.findUnique({
        where: { clerkOrgId: orgId },
        select: { provider: true, status: true },
      });
      if (!providerAccount || providerAccount.status !== TelematicsProviderStatus.ACTIVE) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'No active telematics provider configured for this organization.',
        });
      }

      const provider = providerAccount.provider;

      setImmediate(() => {
        (async () => {
          try {
            if (provider === TelematicsProvider.MOTIVE) {
              await backdateMotiveData({ clerkOrgId: orgId, startDate, endDate });
            } else {
              await backdateSamsaraData({ clerkOrgId: orgId, startDate, endDate });
            }
            console.log(`[Telematics] Backdate finished for org ${orgId} (${startDate} → ${endDate})`);
          } catch (err: any) {
            console.error(`[Telematics] Backdate failed for org ${orgId}:`, err.message);
          }
        })();
      });

      res.json({
        started: true,
        startDate,
        endDate,
        provider,
        message: 'Backdate started. This runs in the background and may take several minutes.',
      });
    } catch (error) {
      console.error('Error starting backdate:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to start backdate',
      });
    }
  }
);

/**
 * GET /admin/telematics/backdate-report
 *
 * Returns the last backdate run report for the current org (if any).
 * Internal/admin only; requires org context.
 */
router.get(
  '/admin/telematics/backdate-report',
  clerkAuthMiddleware,
  requireOrg,
  requireRole(['internal']),
  async (req: AuthRequest, res) => {
    try {
      const orgId = req.auth!.orgId!;
      const appClient = getAppPrisma();
      const account = await appClient.telematicsProviderAccount.findUnique({
        where: { clerkOrgId: orgId },
        select: { lastBackdateReport: true },
      });
      res.json({ report: account?.lastBackdateReport ?? null });
    } catch (error) {
      console.error('Error fetching backdate report:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to fetch backdate report',
      });
    }
  }
);

/**
 * POST /admin/telematics/sync-date
 *
 * Sync telematics for the current org for a single date.
 * Internal/admin only; requires org context.
 */
router.post(
  '/admin/telematics/sync-date',
  clerkAuthMiddleware,
  requireOrg,
  requireRole(['internal']),
  async (req: AuthRequest, res) => {
    try {
      const body = parseBody(SyncDateSchema, req, res);
      if (!body) return;
      const orgId = req.auth!.orgId!;
      const appClient = getAppPrisma();
      const account = await appClient.telematicsProviderAccount.findUnique({
        where: { clerkOrgId: orgId },
        select: { provider: true, status: true, credentialsJson: true },
      });
      if (!account || account.status !== TelematicsProviderStatus.ACTIVE) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'No active telematics provider configured for this organization.',
        });
      }
      const syncDate = body.date;
      let result: { success: boolean; error?: string };
      if (account.provider === TelematicsProvider.MOTIVE) {
        const apiKey = readCredentials(account.credentialsJson).apiKey as string;
        const r = await syncMotiveOrgForDate(orgId, apiKey, syncDate, false);
        result = { success: r.success, error: r.success ? undefined : r.error };
      } else {
        const apiToken = readCredentials(account.credentialsJson).apiToken as string;
        const r = await syncSamsaraOrgForDate(orgId, apiToken, syncDate, false);
        result = { success: r.success, error: r.success ? undefined : r.error };
      }
      res.json({ success: result.success, date: syncDate, error: result.error });
    } catch (error: any) {
      console.error('Error syncing date:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: error?.message ?? 'Failed to sync date',
      });
    }
  }
);

// GET /telematics/motive/vehicle-utilization
// Returns raw Motive vehicle utilization data for the org (totalDistance from API)
router.get(
  '/motive/vehicle-utilization',
  clerkAuthMiddleware,
  requireOrg,
  requireProvider(TelematicsProvider.MOTIVE),
  async (req: AuthRequest, res) => {
    try {
      const pagination = parseQuery(PaginationSchema, req, res);
      if (!pagination) return;
      const { page, pageSize } = pagination;

      const startedAt = Date.now();
      const fetchedAt = new Date().toISOString();
      const orgId = req.auth!.orgId!;
      const appClient = getAppPrisma();

      const cacheKey = `telematics:motive:vehicle-utilization:${orgId}`;
      const { value: allRecords, hit } = await telematicsCache.getOrSet(cacheKey, async () => {
        return await appClient.motiveVehicleUtilization.findMany({
          where: { clerkOrgId: orgId },
          orderBy: [{ date: 'desc' }, { vehicleId: 'asc' }],
        });
      });

      const total = Array.isArray(allRecords) ? allRecords.length : 0;
      const records = Array.isArray(allRecords)
        ? allRecords.slice((page - 1) * pageSize, page * pageSize)
        : [];

      const elapsedMs = Date.now() - startedAt;
      console.log('[Telematics] GET /telematics/motive/vehicle-utilization', {
        fetchedAt, orgId, total, page, pageSize, cache: hit ? 'HIT' : 'MISS', elapsedMs,
      });

      res.setHeader('Cache-Control', 'private, max-age=36000');
      res.setHeader('X-Cache', hit ? 'HIT' : 'MISS');
      res.setHeader('X-Elapsed-Ms', String(elapsedMs));
      res.json({
        data: records,
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      });
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
// Returns Motive driver utilization with totalDistance (miles) from driving_periods
router.get(
  '/motive/driver-utilization',
  clerkAuthMiddleware,
  requireOrg,
  requireProvider(TelematicsProvider.MOTIVE),
  async (req: AuthRequest, res) => {
    try {
      const startedAt = Date.now();
      const fetchedAt = new Date().toISOString();
      const orgId = req.auth!.orgId!;
      const appClient = getAppPrisma();

      const cacheKey = `telematics:motive:driver-utilization:${orgId}`;
      const { value: records, hit } = await telematicsCache.getOrSet(cacheKey, async () => {
        const utilization = await appClient.motiveDriverUtilization.findMany({
          where: { clerkOrgId: orgId },
          orderBy: [{ date: 'desc' }, { driverId: 'asc' }],
        });

        if (utilization.length === 0) {
          return utilization.map((r: any) => ({ ...r, totalDistance: null }));
        }

        const dates = [...new Set(utilization.map((r: any) => r.date))];
        const periods = await appClient.motiveDrivingPeriod.findMany({
          where: { clerkOrgId: orgId, date: { in: dates } },
          select: { driverId: true, date: true, startKilometers: true, endKilometers: true },
        });

        // Aggregate miles per (driverId, date) from driving periods.
        //
        // VERIFICATION NOTE: The Motive client sends X-Metric-Units: false, which should
        // cause the API to return Imperial (miles) units. The field is named
        // "start_kilometers" / "end_kilometers" in the Motive response JSON — this is just
        // the key name and does NOT necessarily mean the values are in km.
        //
        // If X-Metric-Units: false is honoured by the driving_periods endpoint, the values
        // are already MILES and KM_TO_MILES should be 1.0 (no conversion needed).
        // If the endpoint ignores the header and always returns km, the conversion is correct.
        //
        // TODO: Confirm with a live API test: fetch a driving period and compare the
        // (end - start) difference against a known trip distance in miles. If the conversion
        // produces numbers ~37.9% too small, set KM_TO_MILES = 1.0.
        const KM_TO_MILES = 0.62137119223733;
        const milesByDriverDate = new Map<string, number>();
        for (const p of periods) {
          const start = p.startKilometers ?? 0;
          const end = p.endKilometers ?? 0;
          const rawDelta = end > start ? end - start : 0;
          if (rawDelta <= 0) continue;
          const key = `${p.driverId}:${p.date}`;
          milesByDriverDate.set(key, (milesByDriverDate.get(key) ?? 0) + rawDelta * KM_TO_MILES);
        }

        return utilization.map((r: any) => ({
          ...r,
          totalDistance: milesByDriverDate.get(`${r.driverId}:${r.date}`) ?? null,
        }));
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

// GET /telematics/samsara/vehicle-stats
// Returns Samsara vehicle data transformed to match Motive's VehicleUtilization format
// This ensures the frontend can consume both providers identically
router.get(
  '/samsara/vehicle-stats',
  clerkAuthMiddleware,
  requireOrg,
  requireProvider(TelematicsProvider.SAMSARA),
  async (req: AuthRequest, res) => {
    try {
      const pagination = parseQuery(PaginationSchema, req, res);
      if (!pagination) return;
      const { page, pageSize } = pagination;

      const startedAt = Date.now();
      const fetchedAt = new Date().toISOString();
      const orgId = req.auth!.orgId!;
      const appClient = getAppPrisma();

      const cacheKey = `telematics:samsara:vehicle-stats:${orgId}`;
      const { value: rawRecords, hit } = await telematicsCache.getOrSet(cacheKey, async () => {
        return await appClient.samsaraRawData.findMany({
          where: { clerkOrgId: orgId },
          orderBy: [{ date: 'desc' }, { vehicleId: 'asc' }],
        });
      });

      // Idle fuel: aggregate on read from idling events (assetId = vehicle.id)
      const dates = [...new Set(rawRecords.map((r: any) => r.date))] as string[];
      const idleByDate = await getSamsaraIdleAggregatesByDate(appClient, orgId, dates);

      // Transform Samsara data to unified VehicleUtilization shape.
      // Convert from raw source units: meters→miles, ml→gallons, ms→seconds.
      const transformedRecords = rawRecords.map((record: any) => {
        const idle = idleByDate.get(record.date)?.get(record.vehicleId);
        const idleFuelGallons = idle ? idle.idleFuelMl / 3785.41 : null;

        const totalDistanceMiles = record.distanceTraveledMeters != null
          ? record.distanceTraveledMeters / 1609.34
          : null;
        const totalFuelGallons = record.fuelConsumedMl != null
          ? record.fuelConsumedMl / 3785.41
          : null;
        const engineMs = record.engineRunTimeDurationMs != null
          ? Number(record.engineRunTimeDurationMs)
          : null;
        const idleMs = record.engineIdleTimeDurationMs != null
          ? Number(record.engineIdleTimeDurationMs)
          : null;
        const idleSeconds = idleMs != null ? Math.round(idleMs / 1000) : null;
        const drivingSeconds = engineMs != null && idleMs != null
          ? Math.max(0, Math.round((engineMs - idleMs) / 1000))
          : engineMs != null
            ? Math.round(engineMs / 1000)
            : null;

        return {
          vehicleId: parseInt(record.vehicleId) || 0,
          vehicleNumber: record.vehicleName || null,
          vin: record.vin,
          date: record.date,
          totalDistance: totalDistanceMiles,
          idleTime: idleSeconds,
          drivingTime: drivingSeconds,
          totalFuel: totalFuelGallons,
          idleFuel: idleFuelGallons,
        };
      });

      const total = transformedRecords.length;
      const pagedRecords = transformedRecords.slice((page - 1) * pageSize, page * pageSize);

      const elapsedMs = Date.now() - startedAt;
      console.log('[Telematics] GET /telematics/samsara/vehicle-stats', {
        fetchedAt, orgId, total, page, pageSize, cache: hit ? 'HIT' : 'MISS', elapsedMs,
      });

      res.setHeader('Cache-Control', 'private, max-age=36000');
      res.setHeader('X-Cache', hit ? 'HIT' : 'MISS');
      res.setHeader('X-Elapsed-Ms', String(elapsedMs));
      res.json({
        data: pagedRecords,
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      });
    } catch (error) {
      console.error('Error fetching Samsara vehicle stats:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to fetch Samsara vehicle stats data',
      });
    }
  }
);

export default router;
