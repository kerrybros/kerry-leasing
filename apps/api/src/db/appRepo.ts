/**
 * APP DATABASE REPOSITORY (portal-owned data)
 * 
 * This module handles the application's own database which stores:
 * - Clerk org <-> customer ID mappings
 * - Telematics provider credentials (future)
 * - Normalized telematics metrics (future)
 * 
 * This database CAN be modified and uses normal migrations.
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { PrismaClient: AppPrismaClient } = require('../generated/app-client/index.js');

// Initialize app database client
let appClient: any | null = null;

export function getAppClient(): any {
  if (!appClient) {
    const appDbUrl = process.env.APP_DATABASE_URL;
    
    if (!appDbUrl) {
      throw new Error('APP_DATABASE_URL is not configured');
    }

    appClient = new AppPrismaClient({
      datasources: {
        db: {
          url: appDbUrl,
        },
      },
    });
  }
  
  return appClient;
}

/**
 * Get customer ID for a Clerk organization
 * @param clerkOrgId - Clerk organization ID
 * @returns Customer ID from repair database, or null if not mapped
 */
export async function getCustomerIdForOrg(
  clerkOrgId: string
): Promise<string | null> {
  try {
    const client = getAppClient();
    
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
 * Link a Clerk organization to a customer ID
 * @param clerkOrgId - Clerk organization ID
 * @param customerId - Customer ID from repair database
 * @returns Created or updated mapping
 */
export async function linkOrgToCustomer(
  clerkOrgId: string,
  customerId: string
) {
  const client = getAppClient();
  
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
  const client = getAppClient();
  
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
    const client = getAppClient();
    await client.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    console.error('App database not available:', error);
    return false;
  }
}

/**
 * Disconnect from app database
 */
export async function disconnectAppDb() {
  if (appClient) {
    await appClient.$disconnect();
    appClient = null;
  }
}
