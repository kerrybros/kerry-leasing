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
import { getDieselPricePerGallon } from '../lib/eiaFuelPrice.js';
import { cacheGetOrSet, getRedis } from '../lib/redis.js';
import { config } from '../config.js';

const FLEET_LIST_TTL = 900;  // 15 minutes
const FLEET_UNIT_TTL = 900;  // 15 minutes
const fleetEnv = () => (config.nodeEnv === 'production' ? 'prod' : 'dev');

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
 * Get all service plan units with combined telematics and repair data.
 * Only units with isIncluded=true (customer portal) are returned.
 * Tenant-scoped to authenticated org
 */
router.get('/units', clerkAuthMiddleware, requireOrg, async (req: AuthRequest, res) => {
  try {
    const clerkOrgId = req.auth!.orgId!;
    const appPrisma = getAppPrisma();
    const repairPrisma = getRepairPrisma();
    const cacheKey = `${fleetEnv()}:fleet:units:${clerkOrgId}`;

    // Serve from cache if available
    const redis = getRedis();
    if (redis) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) return res.json(JSON.parse(cached));
      } catch {} // fall through to DB
    }

    // 1. Get included service plan units for this org (excluded units are hidden from the portal)
    const servicePlanUnits = await (appPrisma.servicePlanUnit as any).findMany({
      where: { clerkOrgId, isIncluded: true },
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
        const records = await appPrisma.samsaraVehicleUtilization.findMany({
          where: { clerkOrgId, vin: { in: telematicsVins } },
          orderBy: { date: 'desc' },
          distinct: ['vin'],
          select: {
            vin: true,
            date: true,
            vehicleId: true,
            vehicleName: true,
            distanceMiles: true,
            engineOnMinutes: true,
            idleMinutes: true,
            fuelGallons: true,
            idleFuelGallons: true,
          },
        });
        for (const rec of records) {
          if (!rec.vin) continue;
          telematicsMap.set(rec.vin, {
            vehicleId: null,
            vehicleNumber: rec.vehicleName ?? null,
            vin: rec.vin,
            date: rec.date,
            utilizationPercentage: null,
            totalDistance: rec.distanceMiles ?? null,
            idleTime: rec.idleMinutes != null ? rec.idleMinutes * 60 : null,
            totalFuel: rec.fuelGallons ?? null,
            idleFuel: rec.idleFuelGallons ?? null,
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

    const result = { units: enrichedUnits, total: enrichedUnits.length };

    // Write to cache (non-blocking) — redis already declared above
    if (redis) {
      redis.setex(cacheKey, FLEET_LIST_TTL, JSON.stringify(result)).catch(() => {});
    }

    res.json(result);
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

    // Serve from cache if available
    const unitCacheKey = `${fleetEnv()}:fleet:unit:${clerkOrgId}:${identifier}`;
    const unitRedis = getRedis();
    if (unitRedis) {
      try {
        const cached = await unitRedis.get(unitCacheKey);
        if (cached) return res.json(JSON.parse(cached));
      } catch {} // fall through to DB
    }

    // Find the service plan unit (search by VIN or unit number) — excluded units are not accessible
    let servicePlanUnit = await appPrisma.servicePlanUnit.findFirst({
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

    // Fetch provider once — used for both the fallback check and telematics queries below
    const providerAccount = await appPrisma.telematicsProviderAccount.findUnique({
      where: { clerkOrgId },
      select: { provider: true },
    });

    // If no service plan entry but telematics data exists for this VIN, synthesise a
    // minimal entry so the detail page can still render with whatever data is available.
    if (!servicePlanUnit) {
      const excludedMatch = await appPrisma.servicePlanUnit.findFirst({
        where: {
          clerkOrgId,
          isIncluded: false,
          OR: [
            { telematicsVin: identifier },
            { repairVin: identifier },
            { repairUnitNumber: identifier },
          ],
        },
        select: { id: true },
      });
      if (excludedMatch) {
        return res.status(404).json({ error: 'Not Found', message: 'Unit not found' });
      }

      let hasTelematics = false;
      if (providerAccount?.provider === 'MOTIVE') {
        const count = await appPrisma.motiveVehicleUtilization.count({ where: { clerkOrgId, vin: identifier } });
        hasTelematics = count > 0;
      } else if (providerAccount?.provider === 'SAMSARA') {
        const count = await appPrisma.samsaraVehicleUtilization.count({ where: { clerkOrgId, vin: identifier } });
        hasTelematics = count > 0;
      }
      if (!hasTelematics) {
        return res.status(404).json({ error: 'Not Found', message: 'Unit not found' });
      }
      console.log(`[Fleet] No service plan entry for ${identifier} — serving telematics-only detail page`);
      // Synthesise a minimal service plan entry so the rest of the handler works
      servicePlanUnit = {
        id: `synthetic-${identifier}`,
        clerkOrgId,
        telematicsVin: identifier,
        repairUnitId: null,
        repairUnitNumber: null,
        repairVin: null,
        repairCustomerId: null,
        matchType: 'TELEMATICS_ONLY',
        lastSyncedAt: null,
        isIncluded: true,
      } as any;
    }

    // 1. Get full telematics history if available
    let telematicsHistory: any[] = [];
    let liveStats: { odometerMiles: number | null; engineHours: number | null; capturedAt: string | null } | null = null;
    let safetyEvents: any[] = [];
    if (servicePlanUnit.telematicsVin) {

      if (providerAccount?.provider === 'MOTIVE') {
        telematicsHistory = await appPrisma.motiveVehicleUtilization.findMany({
          where: {
            clerkOrgId,
            vin: servicePlanUnit.telematicsVin,
          },
          orderBy: { date: 'desc' },
        });
      } else if (providerAccount?.provider === 'SAMSARA') {
        const records = await appPrisma.samsaraVehicleUtilization.findMany({
          where: { clerkOrgId, vin: servicePlanUnit.telematicsVin },
          orderBy: { date: 'desc' },
          select: {
            vin: true,
            date: true,
            vehicleId: true,
            vehicleName: true,
            distanceMiles: true,
            engineOnMinutes: true,
            idleMinutes: true,
            fuelGallons: true,
            idleFuelGallons: true,
          },
        });
        telematicsHistory = records.map(rec => ({
          vehicleId: rec.vehicleId ?? null,
          vehicleNumber: rec.vehicleName ?? null,
          vin: rec.vin,
          date: rec.date,
          utilizationPercentage: null,
          totalDistance: rec.distanceMiles ?? null,
          idleTime: rec.idleMinutes != null ? rec.idleMinutes * 60 : null,
          totalFuel: rec.fuelGallons ?? null,
          idleFuel: rec.idleFuelGallons ?? null,
        }));

        // Fetch latest stats snapshot for odometer + engine hours
        const vehicleMap = await appPrisma.telematicsVehicleMap.findUnique({
          where: { clerkOrgId_vin: { clerkOrgId, vin: servicePlanUnit.telematicsVin } },
          select: { providerVehicleId: true },
        });
        if (vehicleMap?.providerVehicleId) {
          const snapshot = await appPrisma.samsaraVehicleStatsSnapshot.findFirst({
            where: { clerkOrgId, vehicleId: vehicleMap.providerVehicleId },
            orderBy: { capturedAt: 'desc' },
          });
          if (snapshot) {
            const odometerMeters = snapshot.obdOdometerMeters ?? snapshot.gpsOdometerMeters;
            liveStats = {
              odometerMiles: odometerMeters != null ? Math.round(odometerMeters / 1609.34) : null,
              engineHours: snapshot.obdEngineSeconds != null ? parseFloat((snapshot.obdEngineSeconds / 3600).toFixed(1)) : null,
              capturedAt: snapshot.capturedAt.toISOString(),
            };
          }

          // Fetch safety events (last 90 days)
          const since = new Date();
          since.setDate(since.getDate() - 90);
          const sinceStr = since.toISOString().split('T')[0];
          safetyEvents = await appPrisma.samsaraSafetyEvent.findMany({
            where: { clerkOrgId, vehicleId: vehicleMap.providerVehicleId, eventDate: { gte: sinceStr } },
            orderBy: { eventDate: 'desc' },
            select: {
              samsaraId: true,
              behaviorLabel: true,
              severity: true,
              maxValue: true,
              time: true,
              eventDate: true,
              driverName: true,
              lat: true,
              lon: true,
            },
          });
        }
      }
    }

    // 2. Get repair history if available
    let repairHistory: any[] = [];
    let unitInfo: any = null;

    console.log(`[Fleet] Unit ${identifier}: repairUnitId=${servicePlanUnit.repairUnitId ?? 'null'}, telematicsVin=${servicePlanUnit.telematicsVin ?? 'null'}`);

    if (servicePlanUnit.repairUnitId && !servicePlanUnit.repairUnitId.startsWith('telematics-')) {
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
          
          // Get repair history from revenue_details.
          // Customer filter is applied when available to scope results, but we
          // still fetch if only the unit number is known — unit numbers are unique
          // within a repair shop org so cross-customer contamination is unlikely.
          if (customerUnit.number) {
            const customerFilter = servicePlanUnit.repairCustomerId
              ? { customer_external_id: servicePlanUnit.repairCustomerId }
              : customerUnit.customer
                ? { customer: customerUnit.customer }
                : {};

            const rows = await repairPrisma.revenue_details.findMany({
              where: {
                organization_id: REPAIR_SHOP_ORG_ID,
                unit: customerUnit.number,
                ...customerFilter,
              },
              orderBy: { invoice_date: 'desc' },
              select: {
                id: true,
                invoice_date: true,
                number: true,
                order: true,
                type: true,
                customer_external_id: true,
                part_description: true,
                service_description: true,
                global_service_description: true,
                complaint_description: true,
                component: true,
                system: true,
                total: true,
                sales_tax: true,
                customer: true,
                unit: true,
              },
            });

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
              component: r.component ?? null,
              system: r.system ?? null,
              line_amt: toNumber(r.total),
              tax_amt: toNumber(r.sales_tax),
              customer: r.customer ?? null,
              customer_external_id: r.customer_external_id ?? null,
              unit: r.unit ?? null,
            }));

            console.log(
              `[Fleet] Found ${repairHistory.length} repairs for unit ${customerUnit.number}` +
              (customerFilter && Object.keys(customerFilter).length ? ` (customer-filtered)` : ` (no customer filter)`)
            );
          } else {
            console.log('[Fleet] Skipping repairs query: no unit number on customer_units row');
          }
        }
      } catch (error) {
        console.error(`[Fleet] Error fetching repair history for unit ${servicePlanUnit.repairUnitId}:`, error);
      }
    }

    const unitResult = {
      servicePlan: {
        id: servicePlanUnit.id,
        repairUnitNumber: servicePlanUnit.repairUnitNumber,
        matchType: servicePlanUnit.matchType,
        repairVin: servicePlanUnit.repairVin,
        telematicsVin: servicePlanUnit.telematicsVin,
        lastSyncedAt: servicePlanUnit.lastSyncedAt,
      },
      unitInfo,
      liveStats,
      telematics: {
        history: telematicsHistory,
        hasData: telematicsHistory.length > 0,
      },
      safetyEvents,
      repairs: {
        history: repairHistory,
        hasData: repairHistory.length > 0,
      },
    };

    // Write to cache (non-blocking)
    if (unitRedis) {
      unitRedis.setex(unitCacheKey, FLEET_UNIT_TTL, JSON.stringify(unitResult)).catch(() => {});
    }

    res.json(unitResult);
  } catch (error) {
    console.error('[Fleet] Error fetching unit details:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch unit details',
    });
  }
});

/**
 * GET /fleet/geofences
 * Returns active Motive geofences for the org (id, name, category, locationPoints, address).
 */
router.get('/geofences', clerkAuthMiddleware, requireOrg, async (req: AuthRequest, res) => {
  try {
    const clerkOrgId = req.auth!.orgId!;
    const appPrisma = getAppPrisma();

    const geofences = await appPrisma.motiveGeofence.findMany({
      where: { clerkOrgId, status: 'active' },
      select: {
        id: true,
        name: true,
        category: true,
        locationPoints: true,
        address: true,
      },
      orderBy: { name: 'asc' },
    });

    res.json({ geofences });
  } catch (error: any) {
    console.error('[Fleet] Error fetching geofences:', error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
});

/**
 * GET /fleet/idle-events
 * Returns idle events for the org from Samsara or Motive, enriched with unit numbers.
 * Query params: startDate (YYYY-MM-DD), endDate (YYYY-MM-DD), limit (default 500, max 2000)
 */
router.get('/idle-events', clerkAuthMiddleware, requireOrg, async (req: AuthRequest, res) => {
  try {
    const clerkOrgId = req.auth!.orgId!;
    const { startDate, endDate } = req.query as {
      startDate?: string; endDate?: string;
    };
    const appPrisma = getAppPrisma();

    const providerAccount = await appPrisma.telematicsProviderAccount.findUnique({
      where: { clerkOrgId },
      select: { provider: true },
    });

    const dateFilter: { gte?: string; lte?: string } = {};
    if (startDate) dateFilter.gte = startDate;
    if (endDate) dateFilter.lte = endDate;

    // Get vehicle map for unit number lookup (include vin for Samsara inclusion filtering)
    const vehicleMaps = await appPrisma.telematicsVehicleMap.findMany({
      where: { clerkOrgId },
      select: { providerVehicleId: true, providerVehicleName: true, vin: true },
    });
    const vehicleNameById = new Map(vehicleMaps.map(v => [v.providerVehicleId, v.providerVehicleName ?? null]));

    // Get included service plan units only — excluded units are filtered out
    const servicePlanUnits = await appPrisma.servicePlanUnit.findMany({
      where: { clerkOrgId, isIncluded: true },
      select: { telematicsVin: true, repairUnitNumber: true },
    });
    const includedVins = new Set(servicePlanUnits.filter(u => u.telematicsVin).map(u => u.telematicsVin!));
    const unitNumberByVin = new Map(servicePlanUnits.filter(u => u.telematicsVin).map(u => [u.telematicsVin!, u.repairUnitNumber ?? null]));

    let events: any[] = [];

    if (providerAccount?.provider === 'MOTIVE') {
      const rows = await appPrisma.motiveIdleEvent.findMany({
        where: { clerkOrgId, ...(Object.keys(dateFilter).length ? { date: dateFilter } : {}) },
        orderBy: { startTime: 'desc' },
        select: {
          motiveEventId: true,
          vehicleNumber: true,
          vin: true,
          startTime: true,
          endTime: true,
          date: true,
          idleFuel: true,
          lat: true,
          lon: true,
          location: true,
          city: true,
          state: true,
          driverId: true,
          driverFirstName: true,
          driverLastName: true,
          endType: true,
        },
      });
      events = rows
        .filter(r => !r.vin || includedVins.has(r.vin))
        .map(r => {
          const durationMs = r.startTime && r.endTime
            ? new Date(r.endTime).getTime() - new Date(r.startTime).getTime()
            : null;
          const unitNumber = r.vin ? (unitNumberByVin.get(r.vin) ?? r.vehicleNumber) : r.vehicleNumber;
          return {
            id: String(r.motiveEventId),
            unitNumber: unitNumber ?? null,
            vin: r.vin ?? null,
            startTime: r.startTime,
            endTime: r.endTime ?? null,
            date: r.date,
            durationMinutes: durationMs != null ? Math.round(durationMs / 60000) : null,
            idleFuelGallons: r.idleFuel ?? null,
            lat: r.lat ?? null,
            lon: r.lon ?? null,
            location: (() => {
              const loc = r.location?.trim() ?? '';
              const city = r.city?.trim() ?? '';
              const state = r.state?.trim() ?? '';
              if (!loc) return [city, state].filter(Boolean).join(', ') || null;
              // If state is known but not already present in location string, append it
              if (state && !loc.includes(state)) return `${loc}, ${state}`;
              return loc;
            })(),
            driverId: r.driverId ?? null,
            driverFirstName: r.driverFirstName ?? null,
            driverLastName: r.driverLastName ?? null,
            endType: r.endType ?? null,
          };
        });
    } else if (providerAccount?.provider === 'SAMSARA') {
      const rows = await appPrisma.samsaraIdlingEvent.findMany({
        where: { clerkOrgId, ...(Object.keys(dateFilter).length ? { eventDate: dateFilter } : {}) },
        orderBy: { startTime: 'desc' },
        select: {
          id: true,
          assetId: true,
          startTime: true,
          eventDate: true,
          durationMilliseconds: true,
          fuelConsumedMilliliters: true,
        },
      });
      // Build set of included Samsara assetIds via VIN cross-reference
      const includedAssetIds = new Set(
        vehicleMaps.filter(v => v.vin && includedVins.has(v.vin)).map(v => v.providerVehicleId)
      );
      events = rows
        .filter(r => includedAssetIds.size === 0 || includedAssetIds.has(r.assetId))
        .map(r => ({
          id: r.id,
          unitNumber: vehicleNameById.get(r.assetId) ?? r.assetId,
          vin: null,
          startTime: r.startTime,
          date: r.eventDate,
          durationMinutes: r.durationMilliseconds != null ? Math.round(r.durationMilliseconds / 60000) : null,
          idleFuelGallons: r.fuelConsumedMilliliters != null ? r.fuelConsumedMilliliters / 3785.41 : null,
          lat: null,
          lon: null,
          location: null,
        }));
    }

    // Compute summary stats
    const totalIdleMinutes = events.reduce((s, e) => s + (e.durationMinutes ?? 0), 0);
    const totalIdleFuel = events.reduce((s, e) => s + (e.idleFuelGallons ?? 0), 0);

    // Repeat offenders: units with the most idle events
    const byUnit = new Map<string, { count: number; totalMinutes: number; totalFuel: number }>();
    events.forEach(e => {
      const key = e.unitNumber ?? 'Unknown';
      const cur = byUnit.get(key) ?? { count: 0, totalMinutes: 0, totalFuel: 0 };
      cur.count++;
      cur.totalMinutes += e.durationMinutes ?? 0;
      cur.totalFuel += e.idleFuelGallons ?? 0;
      byUnit.set(key, cur);
    });
    const repeatOffenders = Array.from(byUnit.entries())
      .map(([unitNumber, stats]) => ({ unitNumber, ...stats }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Longest idle events
    const longestEvents = [...events]
      .sort((a, b) => (b.durationMinutes ?? 0) - (a.durationMinutes ?? 0))
      .slice(0, 10);

    res.json({
      provider: providerAccount?.provider ?? null,
      totalEvents: events.length,
      totalIdleMinutes: Math.round(totalIdleMinutes),
      totalIdleFuel: parseFloat(totalIdleFuel.toFixed(2)),
      repeatOffenders,
      longestEvents,
      events,
    });
  } catch (error: any) {
    console.error('[Fleet] Error fetching idle events:', error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
});

/**
 * GET /fleet/config
 * Returns org-level configuration for the fleet dashboard (e.g. fuel price).
 * Authenticated — scoped to org.
 */
router.get('/config', clerkAuthMiddleware, requireOrg, async (_req: AuthRequest, res) => {
  try {
    const dieselPricePerGallon = await getDieselPricePerGallon();
    res.json({ dieselPricePerGallon });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to load fleet config', message: error.message });
  }
});

export default router;
