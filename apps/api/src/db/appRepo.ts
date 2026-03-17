/**
 * APP DATABASE REPOSITORY (portal-owned data)
 * 
 * This module handles the application's own database which stores:
 * - Clerk org <-> customer ID mappings
 * - Telematics provider credentials (future)
 * - Normalized telematics metrics (future)
 * 
 * This database CAN be modified and uses normal migrations.
 * Uses the shared app Prisma client from lib/prisma.js (single connection pool).
 */

import { getAppPrisma } from '../lib/prisma.js';

/**
 * Get customer ID for a Clerk organization
 * @param clerkOrgId - Clerk organization ID
 * @returns Customer ID from repair database, or null if not mapped
 */
export async function getCustomerIdForOrg(
  clerkOrgId: string
): Promise<string | null> {
  try {
    const client = getAppPrisma();
    
    const mapping = await client.customerOrgMap.findUnique({
      where: {
        clerkOrgId,
      },
    });

    return mapping?.customerId || null;
  } catch (error) {
    // If APP_DATABASE_URL is not configured, this will fail
    console.error('Error getting customer ID for org:', error);
    return null;
  }
}

/**
 * Repair customer config (KL org -> Repair customer name + contract start)
 *
 * This intentionally uses "klOrgId" naming to avoid confusion with repair DB IDs.
 */
export async function getRepairCustomerConfig(klOrgId: string): Promise<{
  klOrgId: string;
  customerName: string;
  contractStartDate: Date;
} | null> {
  const client = getAppPrisma();

  const config = await client.repairCustomerConfig.findUnique({
    where: { klOrgId },
    select: {
      klOrgId: true,
      customerName: true,
      contractStartDate: true,
    },
  });

  return config || null;
}

export async function upsertRepairCustomerConfig(input: {
  klOrgId: string;
  customerName: string;
  contractStartDate: Date;
}) {
  const client = getAppPrisma();

  return await client.repairCustomerConfig.upsert({
    where: { klOrgId: input.klOrgId },
    create: {
      klOrgId: input.klOrgId,
      customerName: input.customerName,
      contractStartDate: input.contractStartDate,
    },
    update: {
      customerName: input.customerName,
      contractStartDate: input.contractStartDate,
      updatedAt: new Date(),
    },
  });
}

/**
 * Link a Clerk organization to a customer ID
 * @param clerkOrgId - Clerk organization ID
 * @param customerId - Customer ID from repair database
 * @returns Created or updated mapping
 */
export async function linkOrgToCustomer(
  clerkOrgId: string,
  customerId: string
) {
  const client = getAppPrisma();
  
  return await client.customerOrgMap.upsert({
    where: {
      clerkOrgId,
    },
    create: {
      clerkOrgId,
      customerId,
    },
    update: {
      customerId,
      updatedAt: new Date(),
    },
  });
}

/**
 * Get all organization mappings (admin only)
 * @returns Array of all mappings
 */
export async function getAllOrgMappings() {
  const client = getAppPrisma();
  
  return await client.customerOrgMap.findMany({
    orderBy: {
      createdAt: 'desc',
    },
  });
}

/**
 * Check if app database is available
 * @returns true if connection can be established
 */
export async function isAppDbAvailable(): Promise<boolean> {
  try {
    const client = getAppPrisma();
    await client.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    console.error('App database not available:', error);
    return false;
  }
}

/** Re-export for callers that imported from appRepo (e.g. index.ts) */
export { disconnectAppDb } from '../lib/prisma.js';

/**
 * Get units from telematics data (when there's no repair database mapping)
 * @param clerkOrgId - Clerk organization ID
 * @returns Array of units with basic info from telematics data
 */
export async function getUnitsFromTelematics(clerkOrgId: string) {
  const client = getAppPrisma();
  
  // Get distinct VINs from multiple sources
  const vinSet = new Set<string>();
  const vehicleInfo = new Map<string, { number?: string; name?: string }>();
  
  // 1. Get VINs from vehicle maps
  const vehicleMaps = await client.telematicsVehicleMap.findMany({
    where: { clerkOrgId },
    select: {
      vin: true,
      providerVehicleName: true,
    },
    distinct: ['vin'],
  });
  vehicleMaps.forEach(v => {
    vinSet.add(v.vin);
    vehicleInfo.set(v.vin, { name: v.providerVehicleName || undefined });
  });

  // 2. Get VINs from Samsara raw data
  const samsaraVins = await client.samsaraRawData.findMany({
    where: { clerkOrgId, vin: { not: null } },
    select: { vin: true, vehicleName: true },
    distinct: ['vin'],
  });
  samsaraVins.forEach(v => {
    if (v.vin) {
      vinSet.add(v.vin);
      if (v.vehicleName && !vehicleInfo.has(v.vin)) {
        vehicleInfo.set(v.vin, { name: v.vehicleName });
      }
    }
  });

  // 3. Get VINs from Motive raw data (vehicle utilization)
  const motiveVehicles = await client.motiveVehicleUtilization.findMany({
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
  motiveVehicles.forEach(v => {
    if (v.vin) {
      vinSet.add(v.vin);
      if (v.vehicleNumber && !vehicleInfo.has(v.vin)) {
        vehicleInfo.set(v.vin, { number: v.vehicleNumber });
      }
    }
  });
  
  // 4. Get VINs from Motive driving periods
  const motivePeriods = await client.motiveDrivingPeriod.findMany({
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
  motivePeriods.forEach(v => {
    if (v.vin) {
      vinSet.add(v.vin);
      if (v.vehicleNumber && !vehicleInfo.has(v.vin)) {
        vehicleInfo.set(v.vin, { number: v.vehicleNumber });
      }
    }
  });
  
  // 5. Get VINs from Motive idle events
  const motiveIdle = await client.motiveIdleEvent.findMany({
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
  motiveIdle.forEach(v => {
    if (v.vin) {
      vinSet.add(v.vin);
      if (v.vehicleNumber && !vehicleInfo.has(v.vin)) {
        vehicleInfo.set(v.vin, { number: v.vehicleNumber });
      }
    }
  });
  
  // Build unit objects
  const units = Array.from(vinSet).map(vin => {
    const info = vehicleInfo.get(vin);
    const unitNumber = info?.number || info?.name || vin.slice(-6);
    
    return {
      vin,
      unitNumber,
      make: null,
      model: null,
      year: null,
      customerId: clerkOrgId, // Use orgId as pseudo-customer ID
      customerName: null,
    };
  });
  
  return units;
}
