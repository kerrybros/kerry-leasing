/**
 * REPAIR DATABASE CONSTANTS
 *
 * CRITICAL: The repair database has its own "organization_id" concept
 * which represents the REPAIR SHOP organization, NOT the fleet/customer org.
 *
 * This is DIFFERENT from Clerk organization IDs which represent our portal
 * customers (fleet owners).
 *
 * Tenant isolation works as follows:
 * - Clerk orgId -> customerId mapping (in our APP DB)
 * - customerId -> customer's units (in repair DB via customer_units.cust_id)
 * - ALL repair queries MUST filter by BOTH:
 *   - this repair shop org ID
 *   - the customer ID from the tenant context
 *
 * The value is loaded from the REPAIR_SHOP_ORG_ID environment variable so it
 * does not need to change when pointing at a different shop in staging/prod.
 */

if (!process.env.REPAIR_SHOP_ORG_ID) {
  console.warn('⚠️  REPAIR_SHOP_ORG_ID env var is not set — repair data endpoints will scope incorrectly');
}

/**
 * The fixed repair shop organization ID.
 * Set via REPAIR_SHOP_ORG_ID environment variable.
 * DO NOT confuse this with Clerk organization IDs!
 */
export const REPAIR_SHOP_ORG_ID: string =
  process.env.REPAIR_SHOP_ORG_ID ?? 'org_36whHeTmFumKPNuHkcRY7Yknqvl';
