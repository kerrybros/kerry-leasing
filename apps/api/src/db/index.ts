/**
 * DATABASE ACCESS LAYER
 * 
 * IMPORTANT: This module enforces safe database access patterns.
 * 
 * REPAIR DATABASE (READ-ONLY):
 * - DO NOT import the repair Prisma client directly
 * - ALWAYS use functions from repairRepo
 * - The repair client is intentionally NOT exported
 * 
 * APP DATABASE (READ-WRITE):
 * - Use functions from appRepo for org mappings
 * - Direct client access allowed only if needed for complex queries
 */

// Export ONLY the repository functions, NOT the raw clients
export * from './repairRepo.js';
export * from './appRepo.js';

// DO NOT export repair Prisma client directly
// This prevents accidental writes to the repair database

/**
 * ⚠️  SAFETY NOTICE:
 * 
 * If you need to access repair database data:
 * 1. Add a new read-only function to repairRepo.ts
 * 2. Ensure it includes customerId filtering for tenant isolation
 * 3. Import from this barrel export (src/db)
 * 
 * NEVER import from src/generated/repair-client directly!
 */
