import { config } from '../config.js';
import { getAppPrisma } from './prisma.js';

/**
 * Resolve the org id used in the app database (`kl_org_id`, `clerk_org_id` on
 * org-scoped tables, etc.).
 *
 * This project’s app DB is keyed to **dev** Clerk org ids. In **production**,
 * Clerk session JWTs use **live (prod) org** ids, so we translate
 * `prod org id → dev org id` using `clerk_dev_prod_org_map`.
 *
 * In **non-production** (local / preview API with dev keys), the JWT already
 * carries the dev org id — use it as-is.
 */
export async function mapOrgId(
  orgId: string | null | undefined
): Promise<string | null> {
  if (orgId == null || orgId === '') {
    return orgId ?? null;
  }

  if (config.nodeEnv !== 'production') {
    return orgId;
  }

  const prisma = getAppPrisma();

  const asProd = await prisma.clerkDevProdOrgMap.findFirst({
    where: { prodOrgId: orgId },
    select: { devOrgId: true },
  });
  if (asProd) return asProd.devOrgId;

  const asDevRow = await prisma.clerkDevProdOrgMap.findFirst({
    where: { devOrgId: orgId },
    select: { devOrgId: true },
  });
  if (asDevRow) return asDevRow.devOrgId;

  return orgId;
}
