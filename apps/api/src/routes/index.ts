import { Router } from 'express';
import {
  clerkAuthMiddleware,
  requireOrg,
  requireRole,
  AuthRequest,
} from '../middleware/auth.js';
import * as repairRepo from '../db/repairRepo.js';
import * as appRepo from '../db/appRepo.js';
import { getDieselPricePerGallon } from '../lib/eiaFuelPrice.js';
import { getRepairDbSafetyStatus } from '../safety/repairDbSafety.js';
import { getAppPrisma } from '../lib/prisma.js';
import telematicsRoutes from './telematics.js';
import normalizedTelematicsRoutes from './telematicsNormalized.js';
import cronRoutes from './cron.js';
import servicePlanRoutes from './servicePlan.js';
import driversSetupRoutes from './driversSetup.js';
import fleetRoutes from './fleet.js';
import repairsRoutes from './repairs.js';
import adminOrgsRoutes from './adminOrgs.js';
import sharepointRoutes from './sharepoint.js';
import dailyServiceRoutes from './daily-service.js';
import whiparoundRoutes from './whiparound.js';
import publicReportsRoutes from './publicReports.js';
import emailUnsubscribeRoutes from './emailUnsubscribe.js';
import twilioWebhookRoutes from './twilioWebhooks.js';
import adminSmsReportsRoutes from './adminSmsReports.js';
import smsReportsRoutes from './smsReports.js';
import { LinkOrgSchema, RepairCustomerSchema, parseBody } from '../lib/validate.js';
import { getRedis } from '../lib/redis.js';
import { BrandColorPreset } from '../generated/app-client/index.js';

const router = Router();

// Public health check endpoint — also pings Redis if configured
router.get('/health', async (_req, res) => {
  const redis = getRedis();
  let redisStatus: 'ok' | 'error' | 'not_configured' = 'not_configured';
  let redisLatencyMs: number | null = null;

  if (redis) {
    const t0 = Date.now();
    try {
      await redis.ping();
      redisStatus = 'ok';
      redisLatencyMs = Date.now() - t0;
    } catch (err: any) {
      redisStatus = 'error';
    }
  }

  res.json({
    ok: true,
    timestamp: new Date().toISOString(),
    redis: { status: redisStatus, latencyMs: redisLatencyMs },
  });
});

// Protected endpoint - returns current auth context
router.get('/me', clerkAuthMiddleware, (req: AuthRequest, res) => {
  res.json({
    userId: req.auth?.userId,
    orgId: req.auth?.orgId,
    role: req.auth?.role,
  });
});

// Protected endpoint - requires organization context
// Returns units for the current organization from REPAIR database
router.get(
  '/units',
  clerkAuthMiddleware,
  requireOrg,
  async (req: AuthRequest, res) => {
    try {
      const orgId = req.auth!.orgId!;
      
      // Get customer ID for this org from APP database
      const customerId = await appRepo.getCustomerIdForOrg(orgId);
      
      if (!customerId) {
        // No repair database mapping - return units from telematics data only
        console.log(`No customer mapping for org ${orgId}, returning telematics-only units`);
        
        const telematicsUnits = await appRepo.getUnitsFromTelematics(orgId);
        
        return res.json({
          units: telematicsUnits,
          count: telematicsUnits.length,
          orgId,
          source: 'telematics',
        });
      }

      // Fetch units from REPAIR database (read-only)
      const units = await repairRepo.getUnitsByCustomer(customerId);
      
      res.json({
        units,
        count: units.length,
        orgId,
        customerId,
        source: 'repair',
      });
    } catch (error) {
      console.error('Error fetching units:', error);
      
      // Check if it's a database connection error
      if (error instanceof Error && error.message.includes('not configured')) {
        return res.status(503).json({
          error: 'Service Unavailable',
          message: 'Database configuration incomplete. Please contact administrator.',
        });
      }
      
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to fetch units',
      });
    }
  }
);

// Get repairs/invoices for a specific VIN
router.get(
  '/units/:vin/repairs',
  clerkAuthMiddleware,
  requireOrg,
  async (req: AuthRequest, res) => {
    try {
      const orgId = req.auth!.orgId!;
      const { vin } = req.params;
      
      // Validate VIN parameter
      if (!vin || vin.trim() === '') {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'VIN parameter is required',
        });
      }

      // Get customer ID for this org from APP database
      const customerId = await appRepo.getCustomerIdForOrg(orgId);
      
      if (!customerId) {
        // No repair database mapping - return telematics-only unit
        console.log(`No customer mapping for org ${orgId}, returning telematics-only unit for VIN ${vin}`);
        
        const telematicsUnits = await appRepo.getUnitsFromTelematics(orgId);
        const telematicsUnit = telematicsUnits.find(u => u.vin === vin);
        
        return res.json({
          repairs: [],
          count: 0,
          vin,
          unit: {
            vin,
            unitNumber: telematicsUnit?.unitNumber || vin.slice(-6),
            make: null,
            model: null,
            year: null,
            customerId: orgId,
            customerName: null,
          },
          source: 'telematics',
        });
      }

      // Verify the VIN belongs to this customer (strict ownership check)
      // This validates:
      // - Unit exists in repair DB
      // - Unit belongs to the repair shop organization
      // - Unit is owned by this customer
      const unit = await repairRepo.getUnitByVin(customerId, vin);
      
      if (!unit) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'VIN not found or does not belong to your organization. Access denied.',
          vin,
        });
      }

      // Fetch invoices/repairs from REPAIR database (read-only)
      // This uses strict scoping:
      // - Validates unit ownership again
      // - Filters by repair shop org + customer + unit
      const repairs = await repairRepo.getInvoicesByVin(customerId, vin);
      
      res.json({
        repairs,
        count: repairs.length,
        vin,
        unit: {
          vin: unit.vin,
          unitNumber: unit.unitNumber,
          make: unit.make,
          model: unit.model,
          year: unit.year,
          customerId: unit.customerId,
          customerName: unit.customerName,
        },
        source: 'repair',
      });
    } catch (error) {
      console.error('Error fetching repairs:', error);
      
      if (error instanceof Error && error.message.includes('not configured')) {
        return res.status(503).json({
          error: 'Service Unavailable',
          message: 'Database configuration incomplete.',
        });
      }
      
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to fetch repairs',
      });
    }
  }
);

// Admin endpoint - link Clerk org to customer ID
router.post(
  '/admin/link-org',
  clerkAuthMiddleware,
  requireRole(['internal']),
  async (req: AuthRequest, res) => {
    try {
      const body = parseBody(LinkOrgSchema, req, res);
      if (!body) return;
      const { clerkOrgId, customerId } = body;

      const mapping = await appRepo.linkOrgToCustomer(clerkOrgId, customerId);
      
      res.json({
        success: true,
        mapping: {
          clerkOrgId: mapping.clerkOrgId,
          customerId: mapping.customerId,
          createdAt: mapping.createdAt,
          updatedAt: mapping.updatedAt,
        },
      });
    } catch (error) {
      console.error('Error linking org:', error);
      
      if (error instanceof Error && error.message.includes('not configured')) {
        return res.status(503).json({
          error: 'Service Unavailable',
          message: 'APP_DATABASE_URL not configured. Cannot store org mappings.',
        });
      }
      
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to link organization',
      });
    }
  }
);

// Admin endpoint - get all org mappings
router.get(
  '/admin/org-mappings',
  clerkAuthMiddleware,
  requireRole(['internal']),
  async (req: AuthRequest, res) => {
    try {
      const mappings = await appRepo.getAllOrgMappings();
      
      res.json({
        mappings,
        count: mappings.length,
      });
    } catch (error) {
      console.error('Error fetching mappings:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to fetch mappings',
      });
    }
  }
);

// Admin endpoint - configure repair customer for this KL org
// Stores customer_name + contract_start_date keyed by kl_org_id (Clerk org id)
router.put(
  '/admin/repair-customer',
  clerkAuthMiddleware,
  requireOrg,
  requireRole(['internal']),
  async (req: AuthRequest, res) => {
    try {
      const klOrgId = req.auth!.orgId!;
      const body = parseBody(RepairCustomerSchema, req, res);
      if (!body) return;
      const { customerName, contractStartDate } = body;

      const appPrisma = getAppPrisma();
      const saved = await appPrisma.repairCustomerConfig.upsert({
        where: { klOrgId },
        create: {
          klOrgId,
          customerName: customerName.trim(),
          contractStartDate: new Date(contractStartDate),
        },
        update: {
          customerName: customerName.trim(),
          contractStartDate: new Date(contractStartDate),
          updatedAt: new Date(),
        },
      });

      res.json({
        success: true,
        config: {
          klOrgId: saved.klOrgId,
          customerName: saved.customerName,
          contractStartDate: saved.contractStartDate.toISOString().split('T')[0],
          updatedAt: saved.updatedAt,
        },
      });
    } catch (error) {
      console.error('Error saving repair customer config:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to save repair customer config',
      });
    }
  }
);

router.get(
  '/admin/repair-customer',
  clerkAuthMiddleware,
  requireOrg,
  requireRole(['internal']),
  async (req: AuthRequest, res) => {
    try {
      const klOrgId = req.auth!.orgId!;
      const appPrisma = getAppPrisma();

      const config = await appPrisma.repairCustomerConfig.findUnique({
        where: { klOrgId },
        select: {
          klOrgId: true,
          customerName: true,
          contractStartDate: true,
          updatedAt: true,
        },
      });

      res.json({
        config: config
          ? {
              klOrgId: config.klOrgId,
              customerName: config.customerName,
              contractStartDate: config.contractStartDate.toISOString().split('T')[0],
              updatedAt: config.updatedAt,
            }
          : null,
      });
    } catch (error) {
      console.error('Error fetching repair customer config:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to fetch repair customer config',
      });
    }
  }
);

// Admin endpoint - check repair database safety configuration
router.get(
  '/admin/repair-db-safety',
  clerkAuthMiddleware,
  requireRole(['internal']),
  async (req: AuthRequest, res) => {
    try {
      const safetyStatus = getRepairDbSafetyStatus();
      
      // Also try a simple SELECT query to verify connection
      let connectionWorks = false;
      let connectionError: string | null = null;
      
      try {
        await repairRepo.isRepairDbAvailable();
        connectionWorks = true;
      } catch (error) {
        connectionError = error instanceof Error ? error.message : 'Unknown error';
      }
      
      res.json({
        safetyChecks: {
          urlPresent: safetyStatus.urlPresent,
          hasReadOnlyOption: safetyStatus.hasReadOnlyOption,
          hasSslMode: safetyStatus.hasSslMode,
          hasPublicSchema: safetyStatus.hasPublicSchema,
          allChecksPassed: safetyStatus.allChecksPassed,
        },
        connection: {
          works: connectionWorks,
          error: connectionError,
          url: safetyStatus.connectionString,
        },
        errors: safetyStatus.errors,
        verdict: safetyStatus.allChecksPassed 
          ? '✅ SAFE - Repair database is configured as READ-ONLY'
          : '❌ UNSAFE - Repair database configuration does not meet safety requirements',
      });
    } catch (error) {
      console.error('Error checking repair DB safety:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to check repair database safety',
      });
    }
  }
);

// Example: Internal-only endpoint
router.get(
  '/admin/stats',
  clerkAuthMiddleware,
  requireRole(['internal']),
  (req: AuthRequest, res) => {
    res.json({
      message: 'Internal stats endpoint',
      orgId: req.auth?.orgId,
    });
  }
);

// Mount telematics routes (provider-specific: /telematics/motive/*, /telematics/samsara/*, etc.)
router.use('/telematics', telematicsRoutes);

// Mount normalized telematics routes (provider-agnostic: /telematics/normalized/*)
router.use('/telematics/normalized', normalizedTelematicsRoutes);

// Mount cron routes
router.use('/cron', cronRoutes);

// Mount fleet routes (combined telematics + repair data, filtered by service plan)
router.use('/fleet', fleetRoutes);

// Mount service plan admin routes (requires auth, org, and org:admin role)
router.use(
  '/admin/service-plan',
  clerkAuthMiddleware,
  requireOrg,
  requireRole(['internal']),
  servicePlanRoutes
);

// Mount drivers setup admin routes (include/exclude Motive drivers from portal)
router.use(
  '/admin/drivers-setup',
  clerkAuthMiddleware,
  requireOrg,
  requireRole(['internal']),
  driversSetupRoutes
);

// Mount repairs aggregation routes
router.use('/repairs', repairsRoutes);

// Mount admin orgs routes (customer onboarding + management)
router.use('/admin/orgs', adminOrgsRoutes);

// Mount SharePoint document listing routes (Graph app-only, internal-only)
router.use('/admin/sharepoint', sharepointRoutes);

// Mount daily service log routes (Graph-backed Excel reader)
router.use('/daily-service', dailyServiceRoutes);

// Mount Whip Around read routes
router.use('/whiparound', whiparoundRoutes);

// Mount public tokenized weekly-report endpoint (no Clerk auth — drivers use SMS link)
router.use('/r', publicReportsRoutes);

// Public tokenized email unsubscribe (POST-only opt-out; no Clerk auth)
router.use('/u', emailUnsubscribeRoutes);

// Mount Twilio webhook handlers (signature-verified, no Clerk auth)
router.use('/webhooks/twilio', twilioWebhookRoutes);

// Mount admin SMS-reports endpoints (internal role required)
router.use(
  '/admin/sms-reports',
  clerkAuthMiddleware,
  requireOrg,
  requireRole(['internal']),
  adminSmsReportsRoutes
);

// Mount fleet-user SMS-reports endpoints.
// GET /weeks and /preview are read-only and available to any member of the org
// (the customer-facing weekly preview tab on the driver scorecard page). They're
// already org-scoped via req.auth.orgId. The enrollment mutation is gated to
// org-admins inside the router (requireRole on that route only).
router.use(
  '/sms-reports',
  clerkAuthMiddleware,
  requireOrg,
  smsReportsRoutes
);

// Get organization settings (feature flags)
router.get(
  '/org/settings',
  clerkAuthMiddleware,
  requireOrg,
  async (req: AuthRequest, res) => {
    try {
      const clerkOrgId = req.auth!.orgId!;
      const appPrisma = getAppPrisma();
      
      // Get organization settings
      const settings = await appPrisma.organizationSettings.findUnique({
        where: { clerkOrgId },
        select: {
          tracksDrivers: true,
          serviceRequestUrl: true,
          contractTermYears: true,
          telematicsDashboardUrl: true,
          telematicsDashboardUsername: true,
          telematicsDashboardPassword: true,
          brandColorPreset: true,
        },
      });

      // Get repair customer config (contract start date)
      const repairConfig = await appPrisma.repairCustomerConfig.findUnique({
        where: { klOrgId: clerkOrgId },
        select: { contractStartDate: true },
      });
      
      // Get telematics provider
      const providerAccount = await appPrisma.telematicsProviderAccount.findUnique({
        where: { clerkOrgId },
        select: {
          provider: true,
        },
      });

      // Whiparound configured? — presence of an account row means an API key has been added
      const whiparoundAccount = await appPrisma.whiparoundAccount.findUnique({
        where: { clerkOrgId },
        select: { id: true },
      });

      // Fetch diesel price in parallel — non-blocking, falls back to cached/hardcoded
      const dieselPricePerGallon = await getDieselPricePerGallon();

      res.json({
        tracksDrivers: settings?.tracksDrivers ?? true,
        telematicsProvider: providerAccount?.provider || null,
        contractStartDate: repairConfig?.contractStartDate
          ? repairConfig.contractStartDate.toISOString().split('T')[0]
          : null,
        serviceRequestUrl: settings?.serviceRequestUrl ?? null,
        contractTermYears: settings?.contractTermYears ?? null,
        telematicsDashboardUrl: settings?.telematicsDashboardUrl ?? null,
        telematicsDashboardUsername: settings?.telematicsDashboardUsername ?? null,
        telematicsDashboardPassword: settings?.telematicsDashboardPassword ?? null,
        brandColorPreset: settings?.brandColorPreset ?? null,
        dieselPricePerGallon,
        hasWhiparound: !!whiparoundAccount,
      });
    } catch (error) {
      console.error('Error fetching org settings:', error);
      res.status(503).json({
        error: 'Service Unavailable',
        message: 'Failed to load organization settings. Please try again later.',
      });
    }
  }
);

// Update organization settings (admin-only)
router.put(
  '/admin/org-settings',
  clerkAuthMiddleware,
  requireOrg,
  requireRole(['internal']),
  async (req: AuthRequest, res) => {
    try {
      const clerkOrgId = req.auth!.orgId!;
      const appPrisma = getAppPrisma();
      const {
        tracksDrivers,
        serviceRequestUrl,
        contractTermYears,
        telematicsDashboardUrl,
        telematicsDashboardUsername,
        telematicsDashboardPassword,
        brandColorPreset,
      } = req.body;

      const validPresets = Object.values(BrandColorPreset) as string[];
      const resolvedPreset: BrandColorPreset | null =
        brandColorPreset && validPresets.includes(brandColorPreset)
          ? (brandColorPreset as BrandColorPreset)
          : null;

      await appPrisma.organizationSettings.upsert({
        where: { clerkOrgId },
        update: {
          ...(tracksDrivers !== undefined && { tracksDrivers: Boolean(tracksDrivers) }),
          ...(serviceRequestUrl !== undefined && { serviceRequestUrl }),
          ...(contractTermYears !== undefined && { contractTermYears }),
          ...(telematicsDashboardUrl !== undefined && { telematicsDashboardUrl }),
          ...(telematicsDashboardUsername !== undefined && { telematicsDashboardUsername }),
          ...(telematicsDashboardPassword !== undefined && { telematicsDashboardPassword }),
          ...(brandColorPreset !== undefined && { brandColorPreset: resolvedPreset }),
        },
        create: {
          clerkOrgId,
          tracksDrivers: tracksDrivers !== undefined ? Boolean(tracksDrivers) : true,
          serviceRequestUrl: serviceRequestUrl ?? null,
          contractTermYears: contractTermYears ?? null,
          telematicsDashboardUrl: telematicsDashboardUrl ?? null,
          telematicsDashboardUsername: telematicsDashboardUsername ?? null,
          telematicsDashboardPassword: telematicsDashboardPassword ?? null,
          brandColorPreset: resolvedPreset,
        },
      });

      res.json({ ok: true });
    } catch (error) {
      console.error('Error updating org settings:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
);

export default router;
