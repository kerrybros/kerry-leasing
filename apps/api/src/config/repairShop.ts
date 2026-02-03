/**
 * REPAIR DATABASE CONSTANTS
 * 
 * CRITICAL: The repair database has its own "organization_id" concept
 * which represents the REPAIR SHOP organization, NOT the fleet/customer org.
 * 
 * This is DIFFERENT from Clerk organization IDs which represent our portal
 * customers (fleet owners). The repair shop org ID is hardcoded here because:
 * 
 * 1. We only read from ONE repair shop's data
 * 2. The repair DB is external and read-only (managed by Fullbay)
 * 3. This prevents any cross-shop data leakage
 * 
 * Tenant isolation works as follows:
 * - Clerk orgId -> customerId mapping (in our APP DB)
 * - customerId -> customer's units (in repair DB via customer_units.cust_id)
 * - ALL repair queries MUST filter by BOTH:
 *   - this repair shop org ID
 *   - the customer ID from the tenant context
 */

/**
 * The fixed repair shop organization ID
 * This represents the single repair shop whose data we're accessing
 * 
 * DO NOT confuse this with Clerk organization IDs!
 */
export const REPAIR_SHOP_ORG_ID = 'org_36whHeTmFumKPNuHkcRY7Yknqvl' as const;

/**
 * Validation: Ensure this constant is used in all repair DB queries
 * See: apps/api/src/db/repairRepo.ts
 */
export type RepairShopOrgId = typeof REPAIR_SHOP_ORG_ID;
