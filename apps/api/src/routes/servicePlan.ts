/**
 * Service Plan Admin Routes
 * 
 * Admin-only endpoints for managing service plan units:
 * - Sync repair units to service plan
 * - View all units with match status
 * - Manually match/unmatch units
 * - Include/exclude units from fleet view
 */

import { Router } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { getAppPrisma, getRepairPrisma } from '../lib/prisma.js';
import { REPAIR_SHOP_ORG_ID } from '../config/repairShop.js';
import { ServicePlanMatchType } from '../generated/app-client/index.js';
import { MatchUnitSchema, PaginationSchema, parseBody, parseQuery } from '../lib/validate.js';
import { createId } from '@paralleldrive/cuid2';

const router = Router();

/**
 * POST /admin/service-plan/sync
 * Syncs repair units into service plan table
 * Auto-matches units with matching VINs
 */
router.post('/sync', async (req: AuthRequest, res) => {
  try {
    const clerkOrgId = req.auth!.orgId!; // Get from auth middleware
    
    const appPrisma = getAppPrisma();
    const repairPrisma = getRepairPrisma();
    
    // Load repair customer config for this KL org
    const repairConfig = await appPrisma.repairCustomerConfig.findUnique({
      where: { klOrgId: clerkOrgId },
      select: {
        customerName: true,
        contractStartDate: true,
      },
    });

    if (!repairConfig) {
      return res.status(409).json({
        error: 'MissingConfiguration',
        message:
          'Repair customer is not configured for this KL org. Set customer_name + contract_start_date first.',
        klOrgId: clerkOrgId,
      });
    }

    const CUSTOMER_NAME = repairConfig.customerName;
    const startDate = repairConfig.contractStartDate;

    // 0. Load existing service plan units for merge
    const existingUnits = await appPrisma.servicePlanUnit.findMany({
      where: { clerkOrgId },
      select: { repairUnitId: true, telematicsVin: true },
    });
    
    const existingRepairIds = new Set(existingUnits.map(u => u.repairUnitId));
    const existingTelematicsVins = new Set(
      existingUnits.filter(u => u.telematicsVin).map(u => u.telematicsVin!)
    );
    
    // 1. Fetch revenue_details for this customer since contract start to find ACTIVE units
    const allRevenue = await repairPrisma.revenue_details.findMany({
      where: {
        organization_id: REPAIR_SHOP_ORG_ID,
        invoice_date: {
          gte: startDate,
        },
        customer: {
          equals: CUSTOMER_NAME,
          mode: 'insensitive',
        },
      },
    });
    
    const activeUnitNumbers = new Set(allRevenue.map(r => r.unit).filter(Boolean));
    console.log(
      `[ServicePlan] Found ${activeUnitNumbers.size} unique active units in revenue data since contract start`
    );
    
    // 2. Fetch customer_units for these ACTIVE units only
    const allUnits = await repairPrisma.customer_units.findMany({
      where: {
        organization_id: REPAIR_SHOP_ORG_ID,
        customer: {
          equals: CUSTOMER_NAME,
          mode: 'insensitive',
        },
      },
    });
    
    // Only active units (based on revenue in period)
    const customerUnits = allUnits.filter(u => u.number && activeUnitNumbers.has(u.number));
    
    console.log(`[ServicePlan] Found ${customerUnits.length} active customer units for ${CUSTOMER_NAME}`);
    
    // 2. Fetch all telematics VINs for this org (provider-agnostic)
    // Check what provider this org uses
    const providerAccount = await appPrisma.telematicsProviderAccount.findUnique({
      where: { clerkOrgId },
      select: { provider: true },
    });
    
    let telematicsVehicles: Array<{ vin: string; vehicleNumber: string | null }> = [];
    
    if (providerAccount?.provider === 'MOTIVE') {
      // Query Motive data
      const motiveVehicles = await appPrisma.motiveVehicleUtilization.findMany({
        where: {
          clerkOrgId,
          vin: { not: null },
        },
        select: {
          vin: true,
          vehicleNumber: true,
        },
        distinct: ['vin'],
      });
      telematicsVehicles = motiveVehicles.map(v => ({
        vin: v.vin,
        vehicleNumber: v.vehicleNumber,
      }));
    } else if (providerAccount?.provider === 'SAMSARA') {
      // Query Samsara raw data
      const samsaraVehicles = await appPrisma.samsaraRawData.findMany({
        where: {
          clerkOrgId,
          vin: { not: null },
        },
        select: {
          vin: true,
        },
        distinct: ['vin'],
      });
      telematicsVehicles = samsaraVehicles
        .filter((v): v is { vin: string } => v.vin !== null)
        .map(v => ({
          vin: v.vin,
          vehicleNumber: null, // Samsara doesn't have vehicleNumber
        }));
    }
    
    const telematicsVins = new Set(telematicsVehicles.map(v => v.vin.trim()));
    console.log(`[ServicePlan] Found ${telematicsVins.size} telematics vehicles (${providerAccount?.provider || 'NO_PROVIDER'})`);
    
    // Detect telematics-only units (VINs in telematics but not in repair)
    // These are units that ONLY exist in telematics, never appeared in repair DB
    const repairVins = new Set(
      customerUnits.map(u => u.vin?.trim()).filter(Boolean)
    );
    
    // Only add telematics units that:
    // 1. Don't exist in repair data (not in repairVins)
    // 2. Don't already have a service plan entry (not in existingTelematicsVins)
    const telematicsOnlyVins = Array.from(telematicsVins).filter(
      vin => !repairVins.has(vin)
    );
    
    // Among telematics-only, filter for truly NEW ones (not already in service plan)
    const newTelematicsOnlyVins = telematicsOnlyVins.filter(
      vin => !existingTelematicsVins.has(vin as string)
    );
    
    console.log(`[ServicePlan] Telematics-only units: ${telematicsOnlyVins.length} total, ${newTelematicsOnlyVins.length} new`);
    
    // 3. Upsert each repair unit into service_plan_units
    let autoMatched = 0;
    let unmatched = 0;
    let newRepairUnits = 0;
    let updatedUnits = 0;
    
    for (const unit of customerUnits) {
      const repairVin = unit.vin?.trim() || null;
      const hasVin = repairVin && repairVin.length > 0;
      const telematicsMatch = hasVin && telematicsVins.has(repairVin);
      const isNew = !existingRepairIds.has(unit.unit_id);
      
      const data = {
        repairUnitNumber: unit.number,
        repairVin,
        repairCustomerId: unit.cust_id,
        telematicsVin: telematicsMatch ? repairVin : null,
        matchType: telematicsMatch ? ServicePlanMatchType.AUTO : ServicePlanMatchType.UNMATCHED,
        matchConfidence: telematicsMatch ? 1.0 : null,
        lastSyncedAt: new Date(),
      };
      
      await appPrisma.servicePlanUnit.upsert({
        where: {
          clerkOrgId_repairUnitId: {
            clerkOrgId,
            repairUnitId: unit.unit_id,
          },
        },
        update: data,
        create: {
          clerkOrgId,
          repairUnitId: unit.unit_id,
          ...data,
        },
      });
      
      if (isNew) newRepairUnits++;
      else updatedUnits++;
      
      if (telematicsMatch) autoMatched++;
      else unmatched++;
    }
    
    // 4. Create entries for telematics-only units (units with telematics but no repair data)
    // Use a stable cuid as repairUnitId so VIN changes don't orphan the record.
    for (const vin of newTelematicsOnlyVins) {
      const vehicle = telematicsVehicles.find(v => v.vin === vin);
      await appPrisma.servicePlanUnit.create({
        data: {
          clerkOrgId,
          repairUnitId: createId(),
          repairUnitNumber: vehicle?.vehicleNumber || null,
          repairVin: null,
          repairCustomerId: null,
          telematicsVin: vin,
          isTelematicsOnly: true,
          matchType: ServicePlanMatchType.UNMATCHED,
          matchConfidence: null,
          lastSyncedAt: new Date(),
        },
      });
    }
    
    console.log(`[ServicePlan] Sync complete: ${autoMatched} auto-matched, ${unmatched} unmatched, ${newRepairUnits} new repair units, ${newTelematicsOnlyVins.length} new telematics-only units`);
    
    // Calculate unique unit count: repair units + telematics-only units
    // (matched units are only counted once as part of repair units)
    const uniqueUnitCount = customerUnits.length + newTelematicsOnlyVins.length;
    
    res.json({
      success: true,
      synced: uniqueUnitCount,
      autoMatched,
      unmatched,
      newRepairUnits,
      newTelematicsUnits: newTelematicsOnlyVins.length,
      updatedUnits,
      summary: {
        totalUnits: uniqueUnitCount,
        fromRepair: customerUnits.length,
        fromTelematics: telematicsVins.size,
        newFromRepair: newRepairUnits,
        newFromTelematics: newTelematicsOnlyVins.length,
        matchedUnits: autoMatched, // Matched units are counted in fromRepair
      },
    });
    
  } catch (error) {
    console.error('[ServicePlan] Sync error:', error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
});

/**
 * GET /admin/service-plan/units
 * Lists all service plan units with match status
 */
router.get('/units', async (req: AuthRequest, res) => {
  try {
    const clerkOrgId = req.auth!.orgId!;
    const pagination = parseQuery(PaginationSchema, req, res);
    if (!pagination) return;
    const { page, pageSize } = pagination;
    const appPrisma = getAppPrisma();

    const [units, totalCount] = await Promise.all([
      appPrisma.servicePlanUnit.findMany({
        where: { clerkOrgId },
        orderBy: [{ matchType: 'asc' }, { repairUnitNumber: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      appPrisma.servicePlanUnit.count({ where: { clerkOrgId } }),
    ]);
    
    // Enrich with telematics data for matched units
    // Check what provider this org uses
    const providerAccount = await appPrisma.telematicsProviderAccount.findUnique({
      where: { clerkOrgId },
      select: { provider: true },
    });
    
    const enrichedUnits = await Promise.all(
      units.map(async (unit) => {
        let telematicsData = null;
        
        if (unit.telematicsVin) {
          if (providerAccount?.provider === 'MOTIVE') {
            // Get latest Motive vehicle utilization data
            const latestData = await appPrisma.motiveVehicleUtilization.findFirst({
              where: {
                clerkOrgId,
                vin: unit.telematicsVin,
              },
              orderBy: { date: 'desc' },
              select: {
                vehicleNumber: true,
                date: true,
                totalDistance: true,
                totalFuel: true,
              },
            });
            
            if (latestData) {
              telematicsData = {
                vehicleNumber: latestData.vehicleNumber,
                lastDataDate: latestData.date,
                hasTelematicsData: true,
              };
            }
          } else if (providerAccount?.provider === 'SAMSARA') {
            // Get latest Samsara data from raw table
            const latestData = await appPrisma.samsaraRawData.findFirst({
              where: {
                clerkOrgId,
                vin: unit.telematicsVin,
              },
              orderBy: { date: 'desc' },
              select: {
                date: true,
                rawResponse: true,
              },
            });
            
            if (latestData) {
              telematicsData = {
                vehicleNumber: null,
                lastDataDate: latestData.date,
                hasTelematicsData: true,
              };
            }
          }
        }
        
        return {
          ...unit,
          telematicsData,
        };
      })
    );
    
    // Calculate breakdown by source using the isTelematicsOnly flag
    const fromRepairCount = units.filter(u => !u.isTelematicsOnly).length;
    const fromTelematicsOnlyCount = units.filter(u => u.isTelematicsOnly).length;

    // Count units WITH telematics data (matched repair units + telematics-only units)
    const withTelematicsData = units.filter(u => u.telematicsVin !== null).length;

    const unmatchedFromRepair = units.filter(u =>
      !u.isTelematicsOnly && u.matchType === 'UNMATCHED'
    ).length;
    const unmatchedFromTelematics = fromTelematicsOnlyCount;
    
    res.json({
      units: enrichedUnits,
      pagination: {
        page,
        pageSize,
        total: totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
      },
      summary: {
        total: totalCount,
        matched: units.filter(u => u.matchType !== 'UNMATCHED').length,
        unmatched: units.filter(u => u.matchType === 'UNMATCHED').length,
        fromRepair: fromRepairCount,
        fromTelematicsOnly: fromTelematicsOnlyCount,
        withTelematicsData: withTelematicsData,
        unmatchedFromRepair,
        unmatchedFromTelematics,
      },
    });
    
  } catch (error) {
    console.error('[ServicePlan] List error:', error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
});

/**
 * PUT /admin/service-plan/units/:unitId/match
 * Manually match a repair unit to a telematics VIN
 */
router.put('/units/:unitId/match', async (req: AuthRequest, res) => {
  try {
    const clerkOrgId = req.auth!.orgId!;
    const userId = req.auth!.userId;
    const appPrisma = getAppPrisma();
    const { unitId } = req.params;
    const body = parseBody(MatchUnitSchema, req, res);
    if (!body) return;
    const { telematicsVin } = body;

    // Check what provider this org uses
    const providerAccount = await appPrisma.telematicsProviderAccount.findUnique({
      where: { clerkOrgId },
      select: { provider: true },
    });
    
    // Verify telematics VIN exists
    let telematicsVehicleExists = false;
    
    if (providerAccount?.provider === 'MOTIVE') {
      const motiveVehicle = await appPrisma.motiveVehicleUtilization.findFirst({
        where: {
          clerkOrgId,
          vin: telematicsVin,
        },
      });
      telematicsVehicleExists = !!motiveVehicle;
    } else if (providerAccount?.provider === 'SAMSARA') {
      const samsaraVehicle = await appPrisma.samsaraRawData.findFirst({
        where: {
          clerkOrgId,
          vin: telematicsVin,
        },
      });
      telematicsVehicleExists = !!samsaraVehicle;
    }
    
    if (!telematicsVehicleExists) {
      return res.status(404).json({ error: 'Not Found', message: 'Telematics VIN not found' });
    }
    
    // Update the match
    const updated = await appPrisma.servicePlanUnit.update({
      where: {
        clerkOrgId_repairUnitId: {
          clerkOrgId,
          repairUnitId: unitId,
        },
      },
      data: {
        telematicsVin,
        matchType: ServicePlanMatchType.MANUAL,
        matchedBy: userId,
        matchedAt: new Date(),
      },
    });
    
    res.json({ success: true, unit: updated });
    
  } catch (error) {
    console.error('[ServicePlan] Match error:', error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
});

/**
 * DELETE /admin/service-plan/units/:unitId/match
 * Unmatch a unit (set to UNMATCHED)
 */
router.delete('/units/:unitId/match', async (req: AuthRequest, res) => {
  try {
    const clerkOrgId = req.auth!.orgId!;
    const appPrisma = getAppPrisma();
    const { unitId } = req.params;
    
    const updated = await appPrisma.servicePlanUnit.update({
      where: {
        clerkOrgId_repairUnitId: {
          clerkOrgId,
          repairUnitId: unitId,
        },
      },
      data: {
        telematicsVin: null,
        matchType: ServicePlanMatchType.UNMATCHED,
        matchedBy: null,
        matchedAt: null,
      },
    });
    
    res.json({ success: true, unit: updated });
    
  } catch (error) {
    console.error('[ServicePlan] Unmatch error:', error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
});

/**
 * GET /admin/service-plan/available-vins
 * Get list of available telematics VINs for matching
 */
router.get('/available-vins', async (req: AuthRequest, res) => {
  try {
    const clerkOrgId = req.auth!.orgId!;
    const appPrisma = getAppPrisma();
    
    // Check what provider this org uses
    const providerAccount = await appPrisma.telematicsProviderAccount.findUnique({
      where: { clerkOrgId },
      select: { provider: true },
    });
    
    let telematicsVehicles: Array<{
      vin: string;
      vehicleNumber: string | null;
      vehicleId: number | null;
    }> = [];
    
    if (providerAccount?.provider === 'MOTIVE') {
      // Get all Motive telematics VINs
      const motiveVehicles = await appPrisma.motiveVehicleUtilization.findMany({
        where: {
          clerkOrgId,
          vin: { not: null },
        },
        select: {
          vin: true,
          vehicleNumber: true,
          vehicleId: true,
        },
        distinct: ['vin'],
        orderBy: { vehicleNumber: 'asc' },
      });
      telematicsVehicles = motiveVehicles.map(v => ({
        vin: v.vin,
        vehicleNumber: v.vehicleNumber,
        vehicleId: v.vehicleId,
      }));
    } else if (providerAccount?.provider === 'SAMSARA') {
      // Get all Samsara telematics VINs from raw data table
      const samsaraVehicles = await appPrisma.samsaraRawData.findMany({
        where: {
          clerkOrgId,
          vin: { not: null },
        },
        select: {
          vin: true,
        },
        distinct: ['vin'],
        orderBy: { vin: 'asc' },
      });
      telematicsVehicles = samsaraVehicles
        .filter((v): v is { vin: string } => v.vin !== null)
        .map(v => ({
          vin: v.vin,
          vehicleNumber: null,
          vehicleId: null,
        }));
    }
    
    // Get already matched VINs
    const matchedUnits = await appPrisma.servicePlanUnit.findMany({
      where: {
        clerkOrgId,
        telematicsVin: { not: null },
      },
      select: {
        telematicsVin: true,
        repairUnitNumber: true,
      },
    });
    
    const matchedVins = new Set(matchedUnits.map(u => u.telematicsVin));
    
    // Return all VINs with match status
    const vins = telematicsVehicles.map(v => {
      const matchedUnit = matchedUnits.find(u => u.telematicsVin === v.vin);
      return {
        vin: v.vin,
        vehicleNumber: v.vehicleNumber,
        vehicleId: v.vehicleId,
        isMatched: matchedVins.has(v.vin),
        matchedTo: matchedUnit?.repairUnitNumber || null,
      };
    });
    
    res.json({ vins });
    
  } catch (error) {
    console.error('[ServicePlan] Available VINs error:', error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
});

export default router;
