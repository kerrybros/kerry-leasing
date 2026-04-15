/**
 * Customer-portal Redis cache invalidation, org-scoped.
 *
 * All cache keys follow the convention:
 *   ${env}:fleet:units:${orgId}          — GET /fleet/units list
 *   ${env}:fleet:unit:${orgId}:${id}     — GET /fleet/units/:identifier detail
 *   ${env}:repairs:raw:${orgId}:${hash}  — GET /repairs raw blob
 *
 * Call invalidateCachesAfterServicePlanChange from any route that mutates
 * service_plan_units so the customer portal never serves stale data.
 */

import { getRedis, cacheDelPattern } from './redis.js';
import { config } from '../config.js';

function fleetEnv(): string {
  return config.nodeEnv === 'production' ? 'prod' : 'dev';
}

/** Drops the cached GET /fleet/units list for one org. */
export async function invalidateFleetUnitsListCache(clerkOrgId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  const key = `${fleetEnv()}:fleet:units:${clerkOrgId}`;
  try {
    await redis.del(key);
  } catch {
    /* ignore — non-fatal */
  }
}

/** Drops all GET /fleet/units/:identifier detail keys for one org. */
export async function invalidateFleetUnitDetailCaches(clerkOrgId: string): Promise<void> {
  await cacheDelPattern(`${fleetEnv()}:fleet:unit:${clerkOrgId}:*`);
}

/** Drops all GET /repairs raw blobs for one org (frees orphaned hash-keyed entries). */
export async function invalidateRepairsRawCachesForOrg(clerkOrgId: string): Promise<void> {
  await cacheDelPattern(`${fleetEnv()}:repairs:raw:${clerkOrgId}:*`);
}

/**
 * Umbrella invalidation — call after any service_plan_units mutation.
 * Clears fleet list, all unit-detail keys, and all repairs blobs for the org.
 * Failures are non-fatal; cacheDelPattern already logs errors internally.
 */
export async function invalidateCachesAfterServicePlanChange(clerkOrgId: string): Promise<void> {
  await Promise.all([
    invalidateFleetUnitsListCache(clerkOrgId),
    invalidateFleetUnitDetailCaches(clerkOrgId),
    invalidateRepairsRawCachesForOrg(clerkOrgId),
  ]);
}
