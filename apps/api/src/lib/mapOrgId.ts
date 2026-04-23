import { config } from '../config.js';
import { getAppPrisma } from './prisma.js';

/**
 * Map Clerk org id from the JWT to the org id used in the app database.
 * In production, the JWT and DB use the same prod org ids (no translation).
 * In local/dev with a dev Clerk instance, the DB may still be keyed to prod
 * org ids — look up the mapping by dev org id.
 */
export async function mapOrgId(
  orgId: string | null | undefined
): Promise<string | null> {
  if (orgId == null || orgId === '') {
    return orgId ?? null;
  }
  if (config.nodeEnv === 'production') {
    return orgId;
  }
  const row = await getAppPrisma().clerkDevProdOrgMap.findFirst({
    where: { devOrgId: orgId },
    select: { prodOrgId: true },
  });
  return row?.prodOrgId ?? orgId;
}
