import { Router } from 'express';
import {
  clerkAuthMiddleware,
  requireOrg,
  requireRole,
  AuthRequest,
} from '../middleware/auth.js';
import * as repairRepo from '../db/repairRepo.js';
import * as appRepo from '../db/appRepo.js';
import { getRepairDbSafetyStatus } from '../safety/repairDbSafety.js';
import telematicsRoutes from './telematics.js';
import cronRoutes from './cron.js';

const router = Router();

// Public health check endpoint
router.get('/health', (req, res) => {
  res.json({
    ok: true,
    timestamp: new Date().toISOString(),
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
        return res.status(503).json({
          error: 'Service Unavailable',
          message: 'Organization not linked to a customer. Contact administrator to set up org mapping.',
          orgId,
        });
      }

      // Fetch units from REPAIR database (read-only)
      const units = await repairRepo.getUnitsByCustomer(customerId);
      
      res.json({
        units,
        count: units.length,
        orgId,
        customerId,
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
        return res.status(503).json({
          error: 'Service Unavailable',
          message: 'Organization not linked to a customer. Contact administrator to set up org mapping.',
          orgId,
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
      const { clerkOrgId, customerId } = req.body;
      
      if (!clerkOrgId || !customerId) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'clerkOrgId and customerId are required',
        });
      }

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

// Mount telematics routes
router.use('/telematics', telematicsRoutes);

// Mount cron routes
router.use('/cron', cronRoutes);

export default router;
