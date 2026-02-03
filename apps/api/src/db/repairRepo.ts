/**
 * REPAIR DATABASE REPOSITORY (READ-ONLY)
 * 
 * This module provides SAFE, READ-ONLY access to the repair database.
 * 
 * CRITICAL SAFETY RULES:
 * - NO writes, updates, deletes, or mutations
 * - ALL queries MUST filter by BOTH:
 *   1. REPAIR_SHOP_ORG_ID (fixed repair shop)
 *   2. customerId (tenant isolation)
 * - Connection enforced with default_transaction_read_only=on
 * - Repository pattern prevents direct Prisma client access
 * 
 * TENANT SCOPING:
 * - Repair DB organization_id = repair shop (NOT customer org)
 * - Customer identification via cust_id field
 * - Units belong to customers (customer_units.cust_id)
 * - Invoices linked via customer + unit/VIN
 * 
 * Real schema mapping:
 * - Units: customer_units table
 * - Invoices/Repairs: revenue_details table
 */

import { createRequire } from 'module';
import { REPAIR_SHOP_ORG_ID } from '../config/repairShop.js';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('../generated/repair-client/index.js');

// Singleton repair database client (READ-ONLY)
let repairClient: any | null = null;

/**
 * Get or create the repair database client
 * Connection string MUST include default_transaction_read_only=on
 */
function getRepairClient(): any {
  if (!repairClient) {
    if (!process.env.REPAIR_DATABASE_URL) {
      throw new Error('REPAIR_DATABASE_URL not configured');
    }
    repairClient = new PrismaClient({
      datasources: {
        db: {
          url: process.env.REPAIR_DATABASE_URL,
        },
      },
    });
  }
  return repairClient;
}

/**
 * UNITS - Get all units for a customer
 * 
 * SCOPING:
 * - organization_id = REPAIR_SHOP_ORG_ID (fixed repair shop)
 * - cust_id = customerId (customer tenant)
 * - unit_active = 'Yes' (active units only)
 * 
 * @param customerId - Customer ID for tenant scoping
 * @returns Array of units owned by this customer
 */
export async function getUnitsByCustomer(customerId: string) {
  const client = getRepairClient();
  
  const units = await client.customer_units.findMany({
    where: {
      organization_id: REPAIR_SHOP_ORG_ID, // Fixed repair shop
      cust_id: customerId, // Customer tenant
      unit_active: 'Yes', // Active only
    },
    select: {
      organization_id: true,
      unit_id: true,
      cust_id: true,
      customer: true,
      number: true,
      fleet_num: true,
      nickname: true,
      vin: true,
      chassis_maintenance_year: true,
      chassis_maintenance_make: true,
      chassis_maintenance_model: true,
      type: true,
      subtype: true,
      in_service_date: true,
      mileage: true,
      license_plate: true,
      license_plate_state: true,
    },
    orderBy: {
      number: 'asc',
    },
  });

  return units.map((unit) => ({
    unitId: unit.unit_id,
    organizationId: unit.organization_id,
    customerId: unit.cust_id || '',
    customerName: unit.customer || '',
    unitNumber: unit.number || '',
    fleetNumber: unit.fleet_num || '',
    nickname: unit.nickname || '',
    vin: unit.vin || '',
    year: unit.chassis_maintenance_year || '',
    make: unit.chassis_maintenance_make || '',
    model: unit.chassis_maintenance_model || '',
    type: unit.type || '',
    subtype: unit.subtype || '',
    inServiceDate: unit.in_service_date || '',
    mileage: unit.mileage || '',
    licensePlate: unit.license_plate || '',
    licensePlateState: unit.license_plate_state || '',
  }));
}

/**
 * UNITS - Get a specific unit by VIN (with strict ownership validation)
 * 
 * SECURITY: Triple-scoped validation
 * - organization_id = REPAIR_SHOP_ORG_ID
 * - cust_id = customerId
 * - vin = vin
 * 
 * @param customerId - Customer ID for tenant scoping
 * @param vin - Vehicle Identification Number
 * @returns Unit if found and owned by customer, null otherwise
 */
export async function getUnitByVin(customerId: string, vin: string) {
  const client = getRepairClient();
  
  const unit = await client.customer_units.findFirst({
    where: {
      organization_id: REPAIR_SHOP_ORG_ID, // Fixed repair shop
      cust_id: customerId, // Customer tenant
      vin: vin, // Specific VIN
    },
    select: {
      organization_id: true,
      unit_id: true,
      cust_id: true,
      customer: true,
      number: true,
      fleet_num: true,
      nickname: true,
      vin: true,
      chassis_maintenance_year: true,
      chassis_maintenance_make: true,
      chassis_maintenance_model: true,
      type: true,
      mileage: true,
    },
  });

  if (!unit) return null;

  return {
    unitId: unit.unit_id,
    organizationId: unit.organization_id,
    customerId: unit.cust_id || '',
    customerName: unit.customer || '',
    unitNumber: unit.number || '',
    fleetNumber: unit.fleet_num || '',
    nickname: unit.nickname || '',
    vin: unit.vin || '',
    year: unit.chassis_maintenance_year || '',
    make: unit.chassis_maintenance_make || '',
    model: unit.chassis_maintenance_model || '',
    type: unit.type || '',
    mileage: unit.mileage || '',
  };
}

/**
 * INVOICES - Get repair/invoice history for a specific VIN
 * 
 * CRITICAL: Three-stage validation
 * 1. Verify unit ownership via customer_units (org + customer + VIN)
 * 2. Get unit's customer name for revenue_details join
 * 3. Query revenue_details with strict scoping
 * 
 * SCOPING:
 * - Validates VIN belongs to customer in customer_units
 * - Filters revenue_details by:
 *   - organization_id = REPAIR_SHOP_ORG_ID
 *   - customer = unit's customer name (from customer_units)
 *   - unit = unit's number (from customer_units)
 * 
 * @param customerId - Customer ID for tenant scoping
 * @param vin - Vehicle Identification Number
 * @returns Array of invoice/repair records, empty if unit not owned
 */
export async function getInvoicesByVin(customerId: string, vin: string) {
  const client = getRepairClient();
  
  // STEP 1: Verify unit ownership with strict scoping
  const unit = await client.customer_units.findFirst({
    where: {
      organization_id: REPAIR_SHOP_ORG_ID, // Repair shop org
      cust_id: customerId, // Customer tenant
      vin: vin, // Specific VIN
    },
    select: {
      number: true, // Unit number for revenue_details join
      customer: true, // Customer name for revenue_details join
      vin: true,
    },
  });

  // If unit not found or not owned by customer, return empty
  if (!unit || !unit.number || !unit.customer) {
    return [];
  }

  // STEP 2: Query revenue_details with validated unit info
  // Join based on:
  // - organization_id (repair shop)
  // - customer (from customer_units)
  // - unit (unit number from customer_units)
  const invoices = await client.revenue_details.findMany({
    where: {
      organization_id: REPAIR_SHOP_ORG_ID, // Same repair shop
      customer: unit.customer, // Customer name from validated unit
      unit: unit.number, // Unit number from validated unit
    },
    select: {
      id: true,
      organization_id: true,
      number: true, // Invoice number
      invoice_date: true,
      order: true,
      po: true,
      shop: true,
      customer: true,
      unit: true,
      service_writer: true,
      service_description: true,
      global_service_description: true,
      component: true,
      system: true,
      part_num: true,
      part_description: true,
      type: true,
      qty: true,
      rate: true,
      total: true,
      actual_hours: true,
      lead_tech: true,
      complaint_description: true,
    },
    orderBy: {
      invoice_date: 'desc',
    },
  });

  return invoices.map((inv) => ({
    id: inv.id,
    organizationId: inv.organization_id,
    invoiceNumber: inv.number || '',
    invoiceDate: inv.invoice_date ? inv.invoice_date.toISOString() : '',
    orderNumber: inv.order || '',
    poNumber: inv.po || '',
    shop: inv.shop || '',
    customer: inv.customer || '',
    unit: inv.unit || '',
    serviceWriter: inv.service_writer || '',
    serviceDescription: inv.service_description || '',
    globalServiceDescription: inv.global_service_description || '',
    component: inv.component || '',
    system: inv.system || '',
    partNumber: inv.part_num || '',
    partDescription: inv.part_description || '',
    type: inv.type || '',
    quantity: inv.qty ? Number(inv.qty) : 0,
    rate: inv.rate ? Number(inv.rate) : 0,
    total: inv.total ? Number(inv.total) : 0,
    actualHours: inv.actual_hours ? Number(inv.actual_hours) : 0,
    leadTech: inv.lead_tech || '',
    complaintDescription: inv.complaint_description || '',
  }));
}

/**
 * HEALTH CHECK - Test repair database connection
 * 
 * @returns true if connection works, false otherwise
 */
export async function isRepairDbAvailable(): Promise<boolean> {
  try {
    if (!process.env.REPAIR_DATABASE_URL) {
      return false;
    }
    const client = getRepairClient();
    // Simple query to test connection
    await client.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    console.error('Repair database connection check failed:', error);
    return false;
  }
}

/**
 * CLEANUP - Disconnect from repair database
 * Called during graceful shutdown
 */
export async function disconnectRepairDb(): Promise<void> {
  if (repairClient) {
    await repairClient.$disconnect();
    repairClient = null;
  }
}

/**
 * ⚠️  READ-ONLY ENFORCEMENT
 * 
 * This repository exports ONLY read functions.
 * 
 * DO NOT add:
 * - create, update, delete, or upsert operations
 * - Raw SQL writes ($executeRaw)
 * - Schema migrations
 * 
 * The repair database is EXTERNAL and READ-ONLY.
 * All modifications happen in the source system (Fullbay).
 * 
 * SCOPING GUARANTEE:
 * Every query filters by:
 * 1. REPAIR_SHOP_ORG_ID (fixed constant)
 * 2. customerId (tenant from Clerk org mapping)
 * 3. Additional constraints (VIN, unit ownership, etc.)
 */
