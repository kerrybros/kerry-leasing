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
import { ServicePlanMatchType, UnitType } from '../generated/app-client/index.js';
import { PaginationSchema, parseQuery } from '../lib/validate.js';
import { createId } from '@paralleldrive/cuid2';
import {
  loadSamsaraTelematicsVehiclesForServicePlan,
} from '../lib/servicePlanSamsaraTelematics.js';
import { invalidateCachesAfterServicePlanChange } from '../lib/fleetCache.js';

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
      existingUnits.filter(u => u.telematicsVin).map(u => u.telematicsVin!.trim())
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

    // Units in revenue but with no customer_units record (e.g. billed under a unit number never set up as a unit)
    const customerUnitNumbers = new Set(allUnits.map(u => u.number).filter(Boolean));
    const revenueOnlyUnitNumbers = Array.from(activeUnitNumbers).filter(
      n => n && !customerUnitNumbers.has(n)
    ) as string[];
    console.log(`[ServicePlan] Revenue-only units (in billing but no customer_units record): ${revenueOnlyUnitNumbers.length}`);
    
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
      telematicsVehicles = motiveVehicles
        .filter((v) => v.vin && v.vin.trim().length > 0)
        .map((v) => ({
          vin: v.vin!.trim(),
          vehicleNumber: v.vehicleNumber,
        }));
    } else if (providerAccount?.provider === 'SAMSARA') {
      telematicsVehicles = await loadSamsaraTelematicsVehiclesForServicePlan(
        appPrisma,
        clerkOrgId
      );
    }

    const telematicsVins = new Set(telematicsVehicles.map((v) => v.vin));
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

    // Track unit numbers already processed this sync to catch duplicate customer_units records
    // (same physical unit with two unit_ids in the repair DB, e.g. after a re-creation)
    const processedUnitNumbers = new Set<string>();
    
    for (const unit of customerUnits) {
      const repairVin = unit.vin?.trim() || null;
      const hasVin = repairVin && repairVin.length > 0;
      const telematicsMatch = hasVin && telematicsVins.has(repairVin);
      const isNew = !existingRepairIds.has(unit.unit_id);

      // If this unit number was already processed in this sync, the repair DB has a
      // duplicate customer_units record. Skip to prevent creating two service plan entries.
      if (unit.number && processedUnitNumbers.has(unit.number)) {
        console.log(`[ServicePlan] Skipping duplicate customer_units record: unit=${unit.number} id=${unit.unit_id} (already synced this run)`);
        continue;
      }
      if (unit.number) processedUnitNumbers.add(unit.number);
      
      const data = {
        repairUnitNumber: unit.number,
        repairVin,
        repairCustomerId: unit.cust_id,
        telematicsVin: telematicsMatch ? repairVin : null,
        matchType: telematicsMatch ? ServicePlanMatchType.AUTO : ServicePlanMatchType.UNMATCHED,
        matchConfidence: telematicsMatch ? 1.0 : null,
        lastSyncedAt: new Date(),
      };
      
      // If this is a new repair unit that VIN-matches a telematics vehicle,
      // delete any stale telematics-only record for that VIN to prevent duplicates.
      if (isNew && telematicsMatch && repairVin) {
        await appPrisma.servicePlanUnit.deleteMany({
          where: { clerkOrgId, telematicsVin: repairVin, isTelematicsOnly: true },
        });
      }

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
    
    // 3b. Upsert revenue-only units — exist in billing but have no customer_units record.
    // If a telematics-only record already uses this unit number, upgrade it to a real repair entry
    // instead of creating a duplicate. Use a stable synthetic ID so reruns are idempotent.
    let revenueOnlyAdded = 0;
    let revenueOnlyUpdated = 0;

    // Find any existing telematics-only records whose repairUnitNumber matches a revenue-only unit
    const existingTelematicsOnlyByNumber = await appPrisma.servicePlanUnit.findMany({
      where: {
        clerkOrgId,
        isTelematicsOnly: true,
        repairUnitNumber: { in: revenueOnlyUnitNumbers },
      },
      select: { id: true, repairUnitId: true, repairUnitNumber: true },
    });
    const existingTelematicsOnlyNumberMap = new Map(
      existingTelematicsOnlyByNumber.map(u => [u.repairUnitNumber!, u])
    );

    for (const unitNumber of revenueOnlyUnitNumbers) {
      const syntheticId = `REVENUE_ONLY_${clerkOrgId}_${unitNumber}`;

      // If a telematics-only record already exists with this number, upgrade it in place
      const existingTelematicsRecord = existingTelematicsOnlyNumberMap.get(unitNumber);
      if (existingTelematicsRecord) {
        // Update repairUnitId to the stable synthetic ID and clear isTelematicsOnly
        await appPrisma.servicePlanUnit.update({
          where: { id: existingTelematicsRecord.id },
          data: {
            repairUnitId: syntheticId,
            isTelematicsOnly: false,
            lastSyncedAt: new Date(),
          },
        });
        revenueOnlyUpdated++;
        continue;
      }

      const existing = existingRepairIds.has(syntheticId);
      await appPrisma.servicePlanUnit.upsert({
        where: { clerkOrgId_repairUnitId: { clerkOrgId, repairUnitId: syntheticId } },
        update: { repairUnitNumber: unitNumber, lastSyncedAt: new Date() },
        create: {
          clerkOrgId,
          repairUnitId: syntheticId,
          repairUnitNumber: unitNumber,
          repairVin: null,
          repairCustomerId: null,
          telematicsVin: null,
          matchType: ServicePlanMatchType.UNMATCHED,
          matchConfidence: null,
          isTelematicsOnly: false,
          lastSyncedAt: new Date(),
        },
      });
      if (existing) revenueOnlyUpdated++;
      else revenueOnlyAdded++;
    }
    console.log(`[ServicePlan] Revenue-only units: ${revenueOnlyAdded} added, ${revenueOnlyUpdated} upgraded/updated`);

    // 4. Create entries for telematics-only units (units with telematics but no repair data)
    // Use a stable cuid as repairUnitId so VIN changes don't orphan the record.
    for (const vin of newTelematicsOnlyVins) {
      const vehicle = telematicsVehicles.find((v) => v.vin === vin);
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
    const uniqueUnitCount = customerUnits.length + revenueOnlyUnitNumbers.length + newTelematicsOnlyVins.length;

    await invalidateCachesAfterServicePlanChange(clerkOrgId);

    res.json({
      success: true,
      synced: uniqueUnitCount,
      autoMatched,
      unmatched,
      newRepairUnits,
      newTelematicsUnits: newTelematicsOnlyVins.length,
      newRevenueOnlyUnits: revenueOnlyAdded,
      updatedUnits,
      summary: {
        totalUnits: uniqueUnitCount,
        fromRepair: customerUnits.length,
        fromRevenueOnly: revenueOnlyUnitNumbers.length,
        fromTelematics: telematicsVins.size,
        newFromRepair: newRepairUnits,
        newFromTelematics: newTelematicsOnlyVins.length,
        matchedUnits: autoMatched,
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
    const whereOrg = { clerkOrgId };

    const [
      units,
      totalCount,
      matchedRepairCount,
      needingAttentionCount,
      fromRepairCount,
      fromTelematicsOnlyCount,
      withTelematicsVinCount,
      autoMatchedCount,
      manualMatchedCount,
      confirmedCount,
      excludedCount,
      includedCount,
      unmatchedFromRepairCount,
      telematicsReservedRows,
      providerAccount,
    ] = await Promise.all([
      appPrisma.servicePlanUnit.findMany({
        where: whereOrg,
        orderBy: [{ matchType: 'asc' }, { repairUnitNumber: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      appPrisma.servicePlanUnit.count({ where: whereOrg }),
      appPrisma.servicePlanUnit.count({
        where: {
          ...whereOrg,
          isTelematicsOnly: false,
          matchType: { not: ServicePlanMatchType.UNMATCHED },
        },
      }),
      appPrisma.servicePlanUnit.count({
        where: {
          ...whereOrg,
          OR: [
            { isTelematicsOnly: true, isConfirmed: false },
            {
              isTelematicsOnly: false,
              matchType: ServicePlanMatchType.UNMATCHED,
              isConfirmed: false,
            },
          ],
        },
      }),
      appPrisma.servicePlanUnit.count({
        where: { ...whereOrg, isTelematicsOnly: false },
      }),
      appPrisma.servicePlanUnit.count({
        where: { ...whereOrg, isTelematicsOnly: true },
      }),
      appPrisma.servicePlanUnit.count({
        where: { ...whereOrg, telematicsVin: { not: null } },
      }),
      appPrisma.servicePlanUnit.count({
        where: {
          ...whereOrg,
          isTelematicsOnly: false,
          matchType: ServicePlanMatchType.AUTO,
        },
      }),
      appPrisma.servicePlanUnit.count({
        where: {
          ...whereOrg,
          isTelematicsOnly: false,
          matchType: ServicePlanMatchType.MANUAL,
        },
      }),
      appPrisma.servicePlanUnit.count({
        where: {
          ...whereOrg,
          OR: [
            {
              isTelematicsOnly: false,
              matchType: ServicePlanMatchType.UNMATCHED,
              isConfirmed: true,
            },
            { isTelematicsOnly: true, isConfirmed: true },
          ],
        },
      }),
      appPrisma.servicePlanUnit.count({
        where: { ...whereOrg, isIncluded: false },
      }),
      appPrisma.servicePlanUnit.count({
        where: { ...whereOrg, isIncluded: true },
      }),
      appPrisma.servicePlanUnit.count({
        where: {
          ...whereOrg,
          isTelematicsOnly: false,
          matchType: ServicePlanMatchType.UNMATCHED,
        },
      }),
      appPrisma.servicePlanUnit.findMany({
        where: {
          ...whereOrg,
          matchType: { not: ServicePlanMatchType.UNMATCHED },
          telematicsVin: { not: null },
        },
        select: { telematicsVin: true },
      }),
      appPrisma.telematicsProviderAccount.findUnique({
        where: { clerkOrgId },
        select: { provider: true },
      }),
    ]);

    const telematicsVinsReserved = new Set(
      telematicsReservedRows.map((r) => r.telematicsVin!.trim())
    );

    // Fetch all telematics vehicles once for enrichment and suggestion lookup
    let allTelematicsVehicles: Array<{ vin: string; vehicleNumber: string | null }> = [];
    if (providerAccount?.provider === 'MOTIVE') {
      const rows = await appPrisma.motiveVehicleUtilization.findMany({
        where: { clerkOrgId, vin: { not: null } },
        select: { vin: true, vehicleNumber: true },
        distinct: ['vin'],
      });
      allTelematicsVehicles = rows
        .filter((r) => r.vin && r.vin.trim().length > 0)
        .map((r) => ({ vin: r.vin!.trim(), vehicleNumber: r.vehicleNumber }));
    } else if (providerAccount?.provider === 'SAMSARA') {
      allTelematicsVehicles = await loadSamsaraTelematicsVehiclesForServicePlan(
        appPrisma,
        clerkOrgId
      );
    }

    // Build a map: normalized vehicleNumber → vehicle, for name-based suggestions
    const telematicsByName = new Map<string, { telematicsVin: string; vehicleNumber: string }>();
    for (const v of allTelematicsVehicles) {
      if (v.vehicleNumber) {
        telematicsByName.set(v.vehicleNumber.trim().toLowerCase(), {
          telematicsVin: v.vin,
          vehicleNumber: v.vehicleNumber,
        });
      }
    }

    // Also build VIN→vehicleNumber for enriching matched units
    const telematicsByVin = new Map<string, { vehicleNumber: string | null }>();
    for (const v of allTelematicsVehicles) {
      telematicsByVin.set(v.vin, { vehicleNumber: v.vehicleNumber ?? null });
    }

    const enrichedUnits = await Promise.all(
      units.map(async (unit) => {
        let telematicsData = null;
        
        if (unit.telematicsVin) {
          if (providerAccount?.provider === 'MOTIVE') {
            const latestData = await appPrisma.motiveVehicleUtilization.findFirst({
              where: { clerkOrgId, vin: unit.telematicsVin },
              orderBy: { date: 'desc' },
              select: { vehicleNumber: true, date: true, totalDistance: true, totalFuel: true },
            });
            if (latestData) {
              telematicsData = {
                vehicleNumber: latestData.vehicleNumber,
                lastDataDate: latestData.date,
                hasTelematicsData: true,
              };
            }
          } else if (providerAccount?.provider === 'SAMSARA') {
            const latestData = await appPrisma.samsaraVehicleUtilization.findFirst({
              where: { clerkOrgId, vin: unit.telematicsVin },
              orderBy: { date: 'desc' },
              select: { date: true, vehicleName: true },
            });
            if (latestData) {
              telematicsData = {
                vehicleNumber: latestData.vehicleName ?? null,
                lastDataDate: latestData.date,
                hasTelematicsData: true,
              };
            } else {
              const mapRow = await appPrisma.telematicsVehicleMap.findFirst({
                where: {
                  clerkOrgId,
                  provider: 'SAMSARA',
                  vin: unit.telematicsVin,
                },
                select: { providerVehicleName: true },
              });
              if (mapRow) {
                telematicsData = {
                  vehicleNumber: mapRow.providerVehicleName ?? null,
                  lastDataDate: '',
                  hasTelematicsData: false,
                };
              }
            }
          }
        }

        // For unmatched repair units, suggest a match if a telematics vehicle name = unit number
        let suggestedMatch: { telematicsVin: string; vehicleNumber: string } | null = null;
        if (
          !unit.isTelematicsOnly &&
          unit.matchType === 'UNMATCHED' &&
          unit.repairUnitNumber
        ) {
          const key = unit.repairUnitNumber.trim().toLowerCase();
          const suggestion = telematicsByName.get(key);
          // Only suggest if that VIN isn't already matched to another unit
          if (suggestion) {
            const alreadyMatched = telematicsVinsReserved.has(suggestion.telematicsVin);
            if (!alreadyMatched) suggestedMatch = suggestion;
          }
        }
        
        return {
          ...unit,
          telematicsData,
          suggestedMatch,
        };
      })
    );

    res.json({
      units: enrichedUnits.map((u: any) => ({ ...u, isIncluded: u.isIncluded ?? true })),
      pagination: {
        page,
        pageSize,
        total: totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
      },
      summary: {
        total: totalCount,
        matched: matchedRepairCount,
        unmatched: needingAttentionCount,
        fromRepair: fromRepairCount,
        fromTelematicsOnly: fromTelematicsOnlyCount,
        withTelematicsData: withTelematicsVinCount,
        unmatchedFromRepair: unmatchedFromRepairCount,
        unmatchedFromTelematics: fromTelematicsOnlyCount,
        autoMatched: autoMatchedCount,
        manualMatched: manualMatchedCount,
        confirmed: confirmedCount,
        excluded: excludedCount,
        included: includedCount,
      },
    });
    
  } catch (error) {
    console.error('[ServicePlan] List error:', error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
});

/**
 * PUT /admin/service-plan/units/:unitId/match
 * Manually match a repair unit to a telematics vehicle (by VIN or vehicleId)
 */
router.put('/units/:unitId/match', async (req: AuthRequest, res) => {
  try {
    const clerkOrgId = req.auth!.orgId!;
    const userId = req.auth!.userId;
    const appPrisma = getAppPrisma();
    const { unitId } = req.params;

    // Accept either telematicsVin (VIN match) or telematicsVehicleId (VIN-less match)
    const { telematicsVin, telematicsVehicleId } = req.body as {
      telematicsVin?: string;
      telematicsVehicleId?: string;
    };

    if (!telematicsVin && !telematicsVehicleId) {
      return res.status(400).json({ error: 'Either telematicsVin or telematicsVehicleId is required' });
    }

    // Check what provider this org uses
    const providerAccount = await appPrisma.telematicsProviderAccount.findUnique({
      where: { clerkOrgId },
      select: { provider: true },
    });
    
    // Verify the telematics vehicle exists; resolve the VIN if matching by vehicleId
    let resolvedVin: string | null = telematicsVin ?? null;
    let resolvedVehicleId: string | null = telematicsVehicleId ?? null;
    let vehicleExists = false;

    if (providerAccount?.provider === 'MOTIVE') {
      const where: Record<string, unknown> = { clerkOrgId };
      if (telematicsVin) where.vin = telematicsVin;
      else where.vehicleId = Number(telematicsVehicleId);

      const motiveVehicle = await appPrisma.motiveVehicleUtilization.findFirst({
        where: where as any,
        select: { vin: true, vehicleId: true },
      });
      vehicleExists = !!motiveVehicle;
      if (motiveVehicle) {
        resolvedVin = motiveVehicle.vin ?? null;
        resolvedVehicleId = telematicsVehicleId ? String(motiveVehicle.vehicleId) : null;
      }
    } else if (providerAccount?.provider === 'SAMSARA') {
      if (telematicsVin) {
        const [utilRow, mapRow] = await Promise.all([
          appPrisma.samsaraVehicleUtilization.findFirst({
            where: { clerkOrgId, vin: telematicsVin },
            select: { vin: true },
          }),
          appPrisma.telematicsVehicleMap.findFirst({
            where: { clerkOrgId, provider: 'SAMSARA', vin: telematicsVin },
            select: { vin: true },
          }),
        ]);
        vehicleExists = !!(utilRow || mapRow);
      } else {
        // VIN-less: look up by providerVehicleId in vehicle map
        const vehicleMap = await appPrisma.telematicsVehicleMap.findFirst({
          where: { clerkOrgId, provider: 'SAMSARA', providerVehicleId: telematicsVehicleId! },
          select: { vin: true, providerVehicleId: true },
        });
        vehicleExists = !!vehicleMap;
        resolvedVin = vehicleMap?.vin ?? null;
        resolvedVehicleId = vehicleMap?.providerVehicleId ?? null;
      }
    }
    
    if (!vehicleExists) {
      return res.status(404).json({ error: 'Not Found', message: 'Telematics vehicle not found' });
    }
    
    // Verify unit belongs to this org
    const existingUnit = await appPrisma.servicePlanUnit.findFirst({
      where: { id: unitId, clerkOrgId },
    });
    if (!existingUnit) {
      return res.status(404).json({ error: 'Not Found', message: 'Unit not found' });
    }

    // Update the match
    const updated = await appPrisma.servicePlanUnit.update({
      where: { id: unitId },
      data: {
        telematicsVin: resolvedVin,
        telematicsVehicleId: resolvedVehicleId,
        matchType: ServicePlanMatchType.MANUAL,
        matchedBy: userId,
        matchedAt: new Date(),
      },
    });

    await invalidateCachesAfterServicePlanChange(clerkOrgId);

    res.json({ success: true, unit: updated });
    
  } catch (error) {
    console.error('[ServicePlan] Match error:', error);
    res.status(500).json({ error: 'Internal Server Error', message: (error as any).message });
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
    
    const existingUnit = await appPrisma.servicePlanUnit.findFirst({
      where: { id: unitId, clerkOrgId },
    });
    if (!existingUnit) {
      return res.status(404).json({ error: 'Not Found', message: 'Unit not found' });
    }

    const updated = await appPrisma.servicePlanUnit.update({
      where: { id: unitId },
      data: {
        telematicsVin: null,
        telematicsVehicleId: null,
        matchType: ServicePlanMatchType.UNMATCHED,
        matchedBy: null,
        matchedAt: null,
      },
    });

    await invalidateCachesAfterServicePlanChange(clerkOrgId);

    res.json({ success: true, unit: updated });
    
  } catch (error) {
    console.error('[ServicePlan] Unmatch error:', error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
});

/**
 * GET /admin/service-plan/available-vins
 * Get list of available telematics vehicles for matching (includes VIN-less vehicles)
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
      vin: string | null;
      vehicleNumber: string | null;
      vehicleId: string | null;
    }> = [];
    
    if (providerAccount?.provider === 'MOTIVE') {
      // Get all Motive vehicles — distinct by vehicleId, include those without VINs
      const motiveVehicles = await appPrisma.motiveVehicleUtilization.findMany({
        where: { clerkOrgId },
        select: { vin: true, vehicleNumber: true, vehicleId: true },
        distinct: ['vehicleId'],
        orderBy: { vehicleNumber: 'asc' },
      });
      telematicsVehicles = motiveVehicles.map(v => ({
        vin: v.vin ?? null,
        vehicleNumber: v.vehicleNumber ?? null,
        vehicleId: String(v.vehicleId),
      }));
    } else if (providerAccount?.provider === 'SAMSARA') {
      // telematicsVehicleMap (roster); merge utilization rows so vehicles missing from roster still appear
      const samsaraVehicles = await appPrisma.telematicsVehicleMap.findMany({
        where: { clerkOrgId, provider: 'SAMSARA' },
        select: { vin: true, providerVehicleName: true, providerVehicleId: true },
        orderBy: { providerVehicleName: 'asc' },
      });
      telematicsVehicles = samsaraVehicles.map(v => ({
        vin: v.vin ?? null,
        vehicleNumber: v.providerVehicleName ?? null,
        vehicleId: v.providerVehicleId,
      }));
      const seenVehicleIds = new Set(
        telematicsVehicles.map(v => v.vehicleId).filter(Boolean) as string[]
      );
      const utilRows = await appPrisma.samsaraVehicleUtilization.findMany({
        where: { clerkOrgId },
        select: { vehicleId: true, vin: true, vehicleName: true },
        distinct: ['vehicleId'],
        orderBy: { date: 'desc' },
      });
      for (const u of utilRows) {
        if (seenVehicleIds.has(u.vehicleId)) continue;
        seenVehicleIds.add(u.vehicleId);
        const vinTrim = u.vin?.trim() || null;
        telematicsVehicles.push({
          vin: vinTrim && vinTrim.length > 0 ? vinTrim : null,
          vehicleNumber: u.vehicleName ?? null,
          vehicleId: u.vehicleId,
        });
      }
    }
    
    // Get already matched units (by VIN or vehicleId)
    const matchedUnits = await appPrisma.servicePlanUnit.findMany({
      where: {
        clerkOrgId,
        OR: [
          { telematicsVin: { not: null } },
          { telematicsVehicleId: { not: null } },
        ],
      },
      select: {
        telematicsVin: true,
        telematicsVehicleId: true,
        repairUnitNumber: true,
        customUnitName: true,
      },
    });
    
    const matchedVins = new Set(matchedUnits.map(u => u.telematicsVin).filter(Boolean));
    const matchedVehicleIds = new Set(matchedUnits.map(u => u.telematicsVehicleId).filter(Boolean));
    
    // Return all vehicles with match status
    const vins = telematicsVehicles.map(v => {
      const byVin = v.vin ? matchedUnits.find(u => u.telematicsVin === v.vin) : null;
      const byId = v.vehicleId ? matchedUnits.find(u => u.telematicsVehicleId === v.vehicleId) : null;
      const matchedUnit = byVin ?? byId ?? null;
      const displayName = matchedUnit?.customUnitName ?? matchedUnit?.repairUnitNumber ?? null;
      return {
        vin: v.vin,
        vehicleNumber: v.vehicleNumber,
        vehicleId: v.vehicleId,
        isMatched: !!(v.vin ? matchedVins.has(v.vin) : v.vehicleId ? matchedVehicleIds.has(v.vehicleId) : false),
        matchedTo: displayName,
      };
    });
    
    res.json({ vins });
    
  } catch (error) {
    console.error('[ServicePlan] Available VINs error:', error);
    res.status(500).json({ error: 'Internal Server Error', message: (error as any).message });
  }
});

/**
 * PUT /admin/service-plan/units/:unitId/inclusion
 * Toggle whether a unit appears in the external portal (isIncluded flag)
 */
router.put('/units/:unitId/inclusion', async (req: AuthRequest, res) => {
  try {
    const clerkOrgId = req.auth!.orgId!;
    const appPrisma = getAppPrisma();
    const { unitId } = req.params;
    const { isIncluded } = req.body as { isIncluded: boolean };

    if (typeof isIncluded !== 'boolean') {
      return res.status(400).json({ error: 'isIncluded must be a boolean' });
    }

    const existingUnit = await appPrisma.servicePlanUnit.findFirst({
      where: { id: unitId, clerkOrgId },
    });
    if (!existingUnit) {
      return res.status(404).json({ error: 'Not Found', message: 'Unit not found' });
    }

    const updated = await appPrisma.servicePlanUnit.update({
      where: { id: unitId },
      data: { isIncluded },
    });

    await invalidateCachesAfterServicePlanChange(clerkOrgId);

    res.json({ success: true, unit: updated });
  } catch (error) {
    console.error('[ServicePlan] Inclusion toggle error:', error);
    res.status(500).json({ error: 'Internal Server Error', message: (error as any).message });
  }
});

/**
 * GET /admin/service-plan/available-repair-units
 * Returns unmatched repair-only units for use in the telematics→repair match dropdown
 */
router.get('/available-repair-units', async (req: AuthRequest, res) => {
  try {
    const clerkOrgId = req.auth!.orgId!;
    const appPrisma = getAppPrisma();

    const units = await appPrisma.servicePlanUnit.findMany({
      where: {
        clerkOrgId,
        isTelematicsOnly: false,
        matchType: ServicePlanMatchType.UNMATCHED,
      },
      select: {
        id: true,
        repairUnitNumber: true,
        repairVin: true,
        customUnitName: true,
      },
      orderBy: { repairUnitNumber: 'asc' },
    });

    res.json({ units });
  } catch (error) {
    console.error('[ServicePlan] Available repair units error:', error);
    res.status(500).json({ error: 'Internal Server Error', message: (error as any).message });
  }
});

/**
 * POST /admin/service-plan/units/:telematicsUnitId/merge
 * Merge a telematics-only unit into a repair-only unit.
 * The repair unit absorbs the telematics VIN; the telematics-only record is deleted.
 */
router.post('/units/:telematicsUnitId/merge', async (req: AuthRequest, res) => {
  try {
    const clerkOrgId = req.auth!.orgId!;
    const userId = req.auth!.userId;
    const appPrisma = getAppPrisma();
    const { telematicsUnitId } = req.params;
    const { repairUnitId } = req.body as { repairUnitId: string };

    if (!repairUnitId) {
      return res.status(400).json({ error: 'repairUnitId is required' });
    }

    // Verify the telematics-only unit
    const telematicsUnit = await appPrisma.servicePlanUnit.findFirst({
      where: { id: telematicsUnitId, clerkOrgId, isTelematicsOnly: true },
    });
    if (!telematicsUnit) {
      return res.status(404).json({ error: 'Telematics-only unit not found' });
    }

    // Verify the repair-only unit
    const repairUnit = await appPrisma.servicePlanUnit.findFirst({
      where: { id: repairUnitId, clerkOrgId, isTelematicsOnly: false },
    });
    if (!repairUnit) {
      return res.status(404).json({ error: 'Repair unit not found' });
    }

    // Update the repair unit to absorb the telematics VIN
    const merged = await appPrisma.servicePlanUnit.update({
      where: { id: repairUnitId },
      data: {
        telematicsVin: telematicsUnit.telematicsVin,
        telematicsVehicleId: telematicsUnit.telematicsVehicleId,
        matchType: ServicePlanMatchType.MANUAL,
        matchedBy: userId,
        matchedAt: new Date(),
      },
    });

    // Delete the now-redundant telematics-only record
    await appPrisma.servicePlanUnit.delete({ where: { id: telematicsUnitId } });

    await invalidateCachesAfterServicePlanChange(clerkOrgId);

    res.json({ success: true, unit: merged });
  } catch (error) {
    console.error('[ServicePlan] Merge error:', error);
    res.status(500).json({ error: 'Internal Server Error', message: (error as any).message });
  }
});

/**
 * PUT /admin/service-plan/units/:unitId/confirm
 * Mark a unit as confirmed (intentionally no telematics) or reset it
 */
router.put('/units/:unitId/confirm', async (req: AuthRequest, res) => {
  try {
    const clerkOrgId = req.auth!.orgId!;
    const appPrisma = getAppPrisma();
    const { unitId } = req.params;
    const { isConfirmed } = req.body as { isConfirmed: boolean };

    if (typeof isConfirmed !== 'boolean') {
      return res.status(400).json({ error: 'isConfirmed must be a boolean' });
    }

    const existingUnit = await appPrisma.servicePlanUnit.findFirst({
      where: { id: unitId, clerkOrgId },
    });
    if (!existingUnit) {
      return res.status(404).json({ error: 'Not Found', message: 'Unit not found' });
    }

    const updated = await appPrisma.servicePlanUnit.update({
      where: { id: unitId },
      data: { isConfirmed },
    });

    await invalidateCachesAfterServicePlanChange(clerkOrgId);

    res.json({ success: true, unit: updated });
  } catch (error) {
    console.error('[ServicePlan] Confirm error:', error);
    res.status(500).json({ error: 'Internal Server Error', message: (error as any).message });
  }
});

/**
 * PUT /admin/service-plan/units/:unitId/name
 * Set or clear the custom display name for a unit
 */
router.put('/units/:unitId/name', async (req: AuthRequest, res) => {
  try {
    const clerkOrgId = req.auth!.orgId!;
    const appPrisma = getAppPrisma();
    const { unitId } = req.params;
    const { customUnitName } = req.body as { customUnitName: string | null };

    if (customUnitName !== null && typeof customUnitName !== 'string') {
      return res.status(400).json({ error: 'customUnitName must be a string or null' });
    }

    const existingUnit = await appPrisma.servicePlanUnit.findFirst({
      where: { id: unitId, clerkOrgId },
    });
    if (!existingUnit) {
      return res.status(404).json({ error: 'Not Found', message: 'Unit not found' });
    }

    const updated = await appPrisma.servicePlanUnit.update({
      where: { id: unitId },
      data: { customUnitName: customUnitName?.trim() || null },
    });

    await invalidateCachesAfterServicePlanChange(clerkOrgId);

    res.json({ success: true, unit: updated });
  } catch (error) {
    console.error('[ServicePlan] Name update error:', error);
    res.status(500).json({ error: 'Internal Server Error', message: (error as any).message });
  }
});

/**
 * PUT /admin/service-plan/units/:unitId/type
 * Set or clear the vehicle classification type for a unit
 */
router.put('/units/:unitId/type', async (req: AuthRequest, res) => {
  try {
    const clerkOrgId = req.auth!.orgId!;
    const appPrisma = getAppPrisma();
    const { unitId } = req.params;
    const { unitType } = req.body as { unitType: string | null };

    const validTypes = ['TRACTOR', 'TRAILER', 'SWITCHER', 'BOX_TRUCK', 'AUTO', 'MISC'];
    if (unitType !== null && !validTypes.includes(unitType)) {
      return res.status(400).json({ error: `unitType must be one of ${validTypes.join(', ')} or null` });
    }

    const existingUnit = await appPrisma.servicePlanUnit.findFirst({
      where: { id: unitId, clerkOrgId },
    });
    if (!existingUnit) {
      return res.status(404).json({ error: 'Not Found', message: 'Unit not found' });
    }

    const updated = await appPrisma.servicePlanUnit.update({
      where: { id: unitId },
      data: { unitType: unitType as UnitType | null },
    });

    await invalidateCachesAfterServicePlanChange(clerkOrgId);

    res.json({ success: true, unit: updated });
  } catch (error) {
    console.error('[ServicePlan] Unit type update error:', error);
    res.status(500).json({ error: 'Internal Server Error', message: (error as any).message });
  }
});

export default router;
