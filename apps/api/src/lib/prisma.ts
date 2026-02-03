/**
 * PRISMA CLIENT EXPORTS
 * Centralized Prisma client initialization for both databases
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Dynamically require the Prisma clients (they're CommonJS)
const appModule = require('../generated/app-client/index.js');
const repairModule = require('../generated/repair-client/index.js');

const AppPrismaClient = appModule.PrismaClient;
const RepairPrismaClient = repairModule.PrismaClient;

// =====================================================
// APP DATABASE (READ-WRITE)
// =====================================================
let appClientInstance: any | null = null;

export function getAppPrisma(): any {
  if (!appClientInstance) {
    const appDbUrl = process.env.APP_DATABASE_URL;
    
    if (!appDbUrl) {
      throw new Error('APP_DATABASE_URL is not configured');
    }

    appClientInstance = new AppPrismaClient({
      datasources: {
        db: {
          url: appDbUrl,
        },
      },
    });
  }
  
  return appClientInstance;
}

// Lazy-initialized singleton
export const appPrisma: any = new Proxy({} as any, {
  get(_target, prop) {
    const client = getAppPrisma();
    const value = client[prop];
    // If it's a function, bind it to the client
    if (typeof value === 'function') {
      return value.bind(client);
    }
    return value;
  }
});

// =====================================================
// REPAIR DATABASE (READ-ONLY)
// =====================================================
let repairClientInstance: any | null = null;

export function getRepairPrisma(): any {
  if (!repairClientInstance) {
    const repairDbUrl = process.env.REPAIR_DATABASE_URL;
    
    if (!repairDbUrl) {
      throw new Error('REPAIR_DATABASE_URL is not configured');
    }

    repairClientInstance = new RepairPrismaClient({
      datasources: {
        db: {
          url: repairDbUrl,
        },
      },
    });
  }
  
  return repairClientInstance;
}

// Lazy-initialized singleton
export const repairPrisma: any = new Proxy({} as any, {
  get(_target, prop) {
    const client = getRepairPrisma();
    const value = client[prop];
    // If it's a function, bind it to the client
    if (typeof value === 'function') {
      return value.bind(client);
    }
    return value;
  }
});
