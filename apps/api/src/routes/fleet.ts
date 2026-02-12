/**
 * FLEET API ROUTES
 * 
 * Endpoints for combined fleet data (telematics + repair)
 * Filtered by Service Plan inclusion status
 */

import { Router } from 'express';
import { clerkAuthMiddleware, requireOrg, AuthRequest } from '../middleware/auth.js';
import { getAppPrisma, getRepairPrisma } from '../lib/prisma.js';
import { REPAIR_SHOP_ORG_ID } from '../config/repairShop.js';
import { getSamsaraIdleAggregatesByDate } from '../telematics/samsara/idleAggregates.js';

const router = Router();

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  // Prisma Decimal in JS often stringifies nicely
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toYmd(date: unknown): string | null {
  if (!date) return null;
  if (!(date instanceof Date)) return null;
  // invoice_date is @db.Date; normalize to YYYY-MM-DD for frontend string filtering
  return date.toISOString().split('T')[0] || null;
}

/**
 * GET /fleet/units
 * 
 * Get all included units with combined telematics and repair data
 * Only returns units marked as isIncluded: true in ServicePlanUnit
 * Tenant-scoped to authenticated org
 */
router.get('/units', clerkAuthMiddleware, requireOrg, async (req: AuthRequest, res) => {
  try {
    const clerkOrgId = req.auth!.orgId!;
    const appPrisma = getAppPrisma();
    const repairPrisma = getRepairPrisma();

    // 1. Get all included service plan units for this org
    const servicePlanUnits = await appPrisma.servicePlanUnit.findMany({
      where: {
        clerkOrgId,
        isIncluded: true, // Only included units
      },
      orderBy: { repairUnitNumber: 'asc' },
    });

    // 2. Enrich each unit with telematics and repair data
    // Bulk fetch telematics data
    const telematicsVins = servicePlanUnits
      .map((u) => u.telematicsVin)
      .filter((vin): vin is string => !!vin);

    const telematicsMap = new Map();
    if (telematicsVins.length > 0) {
      // Get provider for this org
      const providerAccount = await appPrisma.telematicsProviderAccount.findUnique({
        where: { clerkOrgId },
        select: { provider: true },
      });

      if (providerAccount?.provider === 'MOTIVE') {
        // Use Motive-specific table
        const records = await appPrisma.motiveVehicleUtilization.findMany({
          where: {
            clerkOrgId,
            vin: { in: telematicsVins },
          },
          orderBy: { date: 'desc' },
          distinct: ['vin'],
          select: {
            vehicleId: true,
            vehicleNumber: true,
            vin: true,
            date: true,
            utilizationPercentage: true,
            totalDistance: true,
            idleTime: true,
            totalFuel: true,
            idleFuel: true,
          },
        });
        for (const rec of records) {
          telematicsMap.set(rec.vin, rec);
        }
      } else if (providerAccount?.provider === 'SAMSARA') {
        // Use Samsara raw data table; idle fuel aggregated on read from idling events (assetId = vehicle.id)
        const records = await appPrisma.samsaraRawData.findMany({
          where: {
            clerkOrgId,
            vin: { in: telematicsVins },
          },
          orderBy: { date: 'desc' },
          distinct: ['vin'],
          select: {
            vin: true,
            date: true,
            vehicleId: true,
            vehicleName: true,
            rawResponse: true,
          },
        });
        const dates = [...new Set(records.map((r) => r.date))];
        const idleByDate = await getSamsaraIdleAggregatesByDate(appPrisma, clerkOrgId, dates);
        for (const rec of records) {
          if (!rec.vin) continue;
          const converted = (rec.rawResponse as any)?.convertedMetrics || {};
          const idle = idleByDate.get(rec.date)?.get(rec.vehicleId);
          const idleFuelGallons = idle ? idle.idleFuelMl / 3785.41 : null;
          telematicsMap.set(rec.vin, {
            vehicleId: null,
            vehicleNumber: rec.vehicleName ?? null,
            vin: rec.vin,
            date: rec.date,
            utilizationPercentage: null,
            totalDistance: converted.milesDriven || null,
            idleTime: converted.idleMinutes ? converted.idleMinutes * 60 : null,
            totalFuel: converted.fuelGallons || null,
            idleFuel: idleFuelGallons,
          });
        }
      }
    }

    // Bulk fetch repair unit info
    const repairUnitIds = servicePlanUnits
      .filter((u) => u.repairVin && !u.repairUnitId.startsWith('telematics-'))
      .map((u) => u.repairUnitId);

    const customerUnitsMap = new Map();
    if (repairUnitIds.length > 0) {
      const cUnits = await repairPrisma.customer_units.findMany({
        where: {
          organization_id: REPAIR_SHOP_ORG_ID,
          unit_id: { in: repairUnitIds },
        },
        select: {
          unit_id: true,
          number: true,
          vin: true,
          cust_id: true,
          customer: true,
          chassis_maintenance_make: true,
          chassis_maintenance_model: true,
          chassis_maintenance_year: true,
        },
      });
      for (const cu of cUnits) {
        customerUnitsMap.set(cu.unit_id, cu);
      }
    }

    // Bulk fetch latest repair dates for these units
    // This is harder because we need "latest per unit" from a large table
    // For now, let's skip the "lastRepairDate" in the list view if it's too expensive
    // Or we can fetch it for all units in one go using a raw query if needed.
    // Given the timeouts, skipping it for the LIST view is safest, or fetching only for the units we found.
    // Let's try to fetch it but optimized: we need unit numbers from customerUnits
    
    const relevantUnitNumbers = Array.from(customerUnitsMap.values())
      .map((cu: any) => cu.number)
      .filter((n) => !!n);

    const latestRepairsMap = new Map();
    if (relevantUnitNumbers.length > 0) {
      try {
        // We only need the latest invoice_date and number
        const latestRepairs = await repairPrisma.revenue_details.findMany({
          where: {
            organization_id: REPAIR_SHOP_ORG_ID,
            unit: { in: relevantUnitNumbers },
          },
          orderBy: { invoice_date: 'desc' },
          distinct: ['unit'],
          select: {
            unit: true,
            invoice_date: true,
            number: true,
            order: true,
          },
        });
        
        for (const r of latestRepairs) {
          if (r.unit) latestRepairsMap.set(r.unit, r);
        }
      } catch (err) {
        console.error('Error bulk fetching latest repairs:', err);
      }
    }

    const enrichedUnits = servicePlanUnits.map((unit) => {
      let telematicsData = null;
      let repairData = null;

      if (unit.telematicsVin) {
        const latest = telematicsMap.get(unit.telematicsVin);
        if (latest) {
          telematicsData = {
            ...latest,
            lastDataDate: latest.date,
          };
        }
      }

      if (unit.repairVin && !unit.repairUnitId.startsWith('telematics-')) {
        const customerUnit = customerUnitsMap.get(unit.repairUnitId);
        if (customerUnit) {
          const latestRepair = customerUnit.number ? latestRepairsMap.get(customerUnit.number) : null;
          
          repairData = {
            unitInfo: {
              unitId: customerUnit.unit_id,
              unitNumber: customerUnit.number,
              vin: customerUnit.vin,
              make: customerUnit.chassis_maintenance_make,
              model: customerUnit.chassis_maintenance_model,
              year: customerUnit.chassis_maintenance_year
                ? Number(customerUnit.chassis_maintenance_year)
                : null,
            },
            lastRepairDate: latestRepair?.invoice_date ? toYmd(latestRepair.invoice_date) : null,
            lastInvoiceNumber: latestRepair?.number || null,
            lastRepairOrder: latestRepair?.order || null,
          };
        }
      }

      return {
        servicePlanId: unit.id,
        repairUnitNumber: unit.repairUnitNumber,
        matchType: unit.matchType,
        repairVin: unit.repairVin,
        telematicsVin: unit.telematicsVin,
        telematics: telematicsData,
        repair: repairData,
        lastSyncedAt: unit.lastSyncedAt,
      };
    });

    res.json({
      units: enrichedUnits,
      total: enrichedUnits.length,
    });
  } catch (error) {
    console.error('[Fleet] Error fetching units:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch fleet units',
    });
  }
});

/**
 * GET /fleet/units/:identifier
 * 
 * Get detailed data for a specific unit (by VIN or unit number)
 * Combines repair history, telematics data, and service plan info
 */
router.get('/units/:identifier', clerkAuthMiddleware, requireOrg, async (req: AuthRequest, res) => {
  try {
    const clerkOrgId = req.auth!.orgId!;
    const { identifier } = req.params;
    const appPrisma = getAppPrisma();
    const repairPrisma = getRepairPrisma();

    // Find the service plan unit (search by VIN or unit number)
    const servicePlanUnit = await appPrisma.servicePlanUnit.findFirst({
      where: {
        clerkOrgId,
        isIncluded: true,
        OR: [
          { telematicsVin: identifier },
          { repairVin: identifier },
          { repairUnitNumber: identifier },
        ],
      },
    });

    if (!servicePlanUnit) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Unit not found or not included in service plan',
      });
    }

    // 1. Get full telematics history if available
    let telematicsHistory: any[] = [];
    if (servicePlanUnit.telematicsVin) {
      // Get provider for this org
      const providerAccount = await appPrisma.telematicsProviderAccount.findUnique({
        where: { clerkOrgId },
        select: { provider: true },
      });

      if (providerAccount?.provider === 'MOTIVE') {
        telematicsHistory = await appPrisma.motiveVehicleUtilization.findMany({
          where: {
            clerkOrgId,
            vin: servicePlanUnit.telematicsVin,
          },
          orderBy: { date: 'desc' },
        });
      } else if (providerAccount?.provider === 'SAMSARA') {
        const records = await appPrisma.samsaraRawData.findMany({
          where: {
            clerkOrgId,
            vin: servicePlanUnit.telematicsVin,
          },
          orderBy: { date: 'desc' },
          select: {
            vin: true,
            date: true,
            vehicleId: true,
            vehicleName: true,
            rawResponse: true,
          },
        });
        const dates = [...new Set(records.map((r) => r.date))];
        const idleByDate = await getSamsaraIdleAggregatesByDate(appPrisma, clerkOrgId, dates);
        telematicsHistory = records.map(rec => {
          const converted = (rec.rawResponse as any)?.convertedMetrics || {};
          const idle = idleByDate.get(rec.date)?.get(rec.vehicleId);
          const idleFuelGallons = idle ? idle.idleFuelMl / 3785.41 : null;
          return {
            vehicleId: null,
            vehicleNumber: rec.vehicleName ?? null,
            vin: rec.vin,
            date: rec.date,
            utilizationPercentage: null,
            totalDistance: converted.milesDriven || null,
            idleTime: converted.idleMinutes ? converted.idleMinutes * 60 : null,
            totalFuel: converted.fuelGallons || null,
            idleFuel: idleFuelGallons,
          };
        });
      }
    }

    // 2. Get repair history if available
    let repairHistory: any[] = [];
    let unitInfo: any = null;

    if (servicePlanUnit.repairVin && !servicePlanUnit.repairUnitId.startsWith('telematics-')) {
      try {
        console.log(`[Fleet] Getting repair data for unit ID: ${servicePlanUnit.repairUnitId}`);
        
        // Get unit info
        const customerUnit = await repairPrisma.customer_units.findFirst({
          where: {
            organization_id: REPAIR_SHOP_ORG_ID,
            unit_id: servicePlanUnit.repairUnitId,
          },
        });

        console.log(`[Fleet] Customer unit found:`, customerUnit ? `${customerUnit.number} (ID: ${customerUnit.unit_id})` : 'NOT FOUND');

        if (customerUnit) {
          unitInfo = {
            unitId: customerUnit.unit_id,
            unitNumber: customerUnit.number,
            vin: customerUnit.vin,
            make: customerUnit.chassis_maintenance_make || null,
            model: customerUnit.chassis_maintenance_model || null,
            year: customerUnit.chassis_maintenance_year
              ? Number(customerUnit.chassis_maintenance_year)
              : null,
            licensePlate: customerUnit.license_plate,
            customerId: customerUnit.cust_id || null,
            customerName: customerUnit.customer || null,
          };
          console.log(
            `[Fleet] Querying revenue_details for repair shop org: ${REPAIR_SHOP_ORG_ID}, customer: ${customerUnit.customer}, unit: ${customerUnit.number}`
          );
          
          // Get repair history from revenue_details
          // Query directly with all filters for efficiency
          if (customerUnit.number && (customerUnit.customer || servicePlanUnit.repairCustomerId)) {
            const rows = await repairPrisma.revenue_details.findMany({
              where: {
                organization_id: REPAIR_SHOP_ORG_ID,
                unit: customerUnit.number,
                ...(servicePlanUnit.repairCustomerId
                  ? { customer_external_id: servicePlanUnit.repairCustomerId }
                  : customerUnit.customer
                    ? { customer: customerUnit.customer }
                    : {}),
              },
              orderBy: { invoice_date: 'desc' },
              select: {
                id: true,
                invoice_date: true,
                number: true, // invoice number
                order: true, // repair order
                type: true, // line type/category
                customer_external_id: true,
                part_description: true,
                service_description: true,
                global_service_description: true,
                complaint_description: true,
                total: true,
                sales_tax: true,
                customer: true,
                unit: true,
              },
            });

            // Map to the shape the frontend expects today
            repairHistory = rows.map((r: any) => ({
              revenue_detail_id: String(r.id),
              invoice_date: toYmd(r.invoice_date),
              invoice_number: r.number ?? null,
              repair_order: r.order ?? null,
              line_code: r.type ?? null,
              parts_description: r.part_description ?? null,
              labor_description:
                r.service_description ??
                r.global_service_description ??
                r.complaint_description ??
                null,
              line_amt: toNumber(r.total),
              tax_amt: toNumber(r.sales_tax),
              customer: r.customer ?? null,
              customer_external_id: r.customer_external_id ?? null,
              unit: r.unit ?? null,
            }));

            console.log(
              `[Fleet] Found ${repairHistory.length} repairs for unit ${customerUnit.number} (customer: ${customerUnit.customer})`
            );
          } else {
            console.log('[Fleet] Skipping repairs query: missing unit number or customer name on customer_units row');
          }
        }
      } catch (error) {
        console.error(`[Fleet] Error fetching repair history for unit ${servicePlanUnit.repairUnitId}:`, error);
      }
    }

    res.json({
      servicePlan: {
        id: servicePlanUnit.id,
        repairUnitNumber: servicePlanUnit.repairUnitNumber,
        matchType: servicePlanUnit.matchType,
        repairVin: servicePlanUnit.repairVin,
        telematicsVin: servicePlanUnit.telematicsVin,
        lastSyncedAt: servicePlanUnit.lastSyncedAt,
      },
      unitInfo,
      telematics: {
        history: telematicsHistory,
        hasData: telematicsHistory.length > 0,
      },
      repairs: {
        history: repairHistory,
        hasData: repairHistory.length > 0,
      },
    });
  } catch (error) {
    console.error('[Fleet] Error fetching unit details:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch unit details',
    });
  }
});

export default router;
