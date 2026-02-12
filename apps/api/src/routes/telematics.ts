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
import { getAppClient } from '../db/appRepo.js';
import { getSamsaraIdleAggregatesByDate } from '../telematics/samsara/idleAggregates.js';
import { validateCredentials } from '../telematics/providers/index.js';
import { TelematicsProvider, TelematicsProviderStatus } from '../telematics/types.js';
import { TtlCache } from '../lib/ttlCache.js';
import { syncMotiveOrgForDate } from '../telematics/motive/syncService.js';
import { syncSamsaraOrgForDate } from '../telematics/samsara/syncService.js';
import { getYesterday } from '../telematics/dates.js';

const router = Router();
const TEN_HOURS_MS = 10 * 60 * 60 * 1000;
const telematicsCache = new TtlCache<any>(TEN_HOURS_MS, 300);

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
      const { date, provider } = req.body;
      const syncDate = date || getYesterday();

      // Validate date format if provided
      if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Date must be in YYYY-MM-DD format',
        });
      }

      // Run sync asynchronously
      console.log(`Manual sync triggered for ${syncDate} by ${req.auth?.userId}`);
      
      const appClient = getAppClient();
      
      // Get all active provider accounts, optionally filtered by provider
      const where: any = { status: TelematicsProviderStatus.ACTIVE };
      if (provider) {
        if (!Object.values(TelematicsProvider).includes(provider)) {
          return res.status(400).json({
            error: 'Bad Request',
            message: `Invalid provider. Must be one of: ${Object.values(TelematicsProvider).join(', ')}`,
          });
        }
        where.provider = provider;
      }
      
      const accounts = await appClient.telematicsProviderAccount.findMany({ where });
      
      console.log(`Found ${accounts.length} active accounts to sync`);
      
      const results: any[] = [];
      let successCount = 0;
      let failCount = 0;

      // Sync each org with its provider-specific service
      for (const account of accounts) {
        try {
          let result: any;
          
          if (account.provider === TelematicsProvider.MOTIVE) {
            const apiKey = (account.credentialsJson as any).apiKey;
            result = await syncMotiveOrgForDate(
              account.clerkOrgId,
              apiKey,
              syncDate,
              false // Not verification
            );
          } else if (account.provider === TelematicsProvider.SAMSARA) {
            const apiToken = (account.credentialsJson as any).apiToken;
            result = await syncSamsaraOrgForDate(
              account.clerkOrgId,
              apiToken,
              syncDate,
              false // Not verification
            );
          } else {
            throw new Error(`Unsupported provider: ${account.provider}`);
          }
          
          results.push({
            clerkOrgId: account.clerkOrgId,
            provider: account.provider,
            success: result.success,
            date: syncDate,
          });
          
          if (result.success) successCount++;
          else failCount++;
          
        } catch (error: any) {
          failCount++;
          results.push({
            clerkOrgId: account.clerkOrgId,
            provider: account.provider,
            success: false,
            error: error.message,
            date: syncDate,
          });
        }
      }

      res.json({
        success: true,
        date: syncDate,
        summary: {
          total: results.length,
          success: successCount,
          failed: failCount,
        },
        results,
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
  requireProvider(TelematicsProvider.MOTIVE),
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
      const appClient = getAppClient();

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

        // Aggregate miles per (driverId, date): sum (endKm - startKm), convert km -> miles
        const KM_TO_MILES = 0.62137119223733;
        const milesByDriverDate = new Map<string, number>();
        for (const p of periods) {
          const start = p.startKilometers ?? 0;
          const end = p.endKilometers ?? 0;
          const km = end > start ? end - start : 0;
          if (km <= 0) continue;
          const key = `${p.driverId}:${p.date}`;
          milesByDriverDate.set(key, (milesByDriverDate.get(key) ?? 0) + km * KM_TO_MILES);
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
      const startedAt = Date.now();
      const fetchedAt = new Date().toISOString();
      const orgId = req.auth!.orgId!;
      const appClient = getAppClient();

      const cacheKey = `telematics:samsara:vehicle-stats:${orgId}`;
      const { value: rawRecords, hit } = await telematicsCache.getOrSet(cacheKey, async () => {
        return await appClient.samsaraRawData.findMany({
          where: { clerkOrgId: orgId },
          orderBy: [{ date: 'desc' }, { vehicleId: 'asc' }],
        });
      });

      // Idle fuel: aggregate on read from idling events (assetId = vehicle.id)
      const dates = [...new Set(rawRecords.map((r: any) => r.date))];
      const idleByDate = await getSamsaraIdleAggregatesByDate(appClient, orgId, dates);

      // Transform Samsara data to match Motive's VehicleUtilization format; use vehicle.name for display
      const transformedRecords = rawRecords.map((record: any) => {
        const converted = record.rawResponse?.convertedMetrics || {};
        const idle = idleByDate.get(record.date)?.get(record.vehicleId);
        const idleFuelGallons = idle ? idle.idleFuelMl / 3785.41 : null;
        return {
          vehicleId: parseInt(record.vehicleId) || 0,
          vehicleNumber: record.vehicleName || null,
          vin: record.vin,
          date: record.date,
          utilizationPercentage: null,
          totalDistance: converted.milesDriven || null,
          idleTime: converted.idleMinutes ? converted.idleMinutes * 60 : null,
          totalFuel: converted.fuelGallons || null,
          idleFuel: idleFuelGallons,
        };
      });

      const elapsedMs = Date.now() - startedAt;
      console.log('[Telematics] GET /telematics/samsara/vehicle-stats', {
        fetchedAt,
        orgId,
        rows: transformedRecords.length,
        cache: hit ? 'HIT' : 'MISS',
        elapsedMs,
      });

      res.setHeader('Cache-Control', 'private, max-age=36000');
      res.setHeader('X-Cache', hit ? 'HIT' : 'MISS');
      res.setHeader('X-Elapsed-Ms', String(elapsedMs));
      res.json(transformedRecords);
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
