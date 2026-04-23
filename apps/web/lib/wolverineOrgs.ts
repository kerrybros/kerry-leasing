/** Wolverine (customer) org — dev vs prod Clerk org ids. Used for one-off feature flags in the UI. */
export const WOLVERINE_CLERK_ORG_IDS = [
  'org_39B7lu1b8YKds8IOtzrk6LpKnLW', // dev
  'org_3CjgT71DAi9kYZt1vYIVh7DMirI', // prod
] as const;

export function isWolverineClerkOrg(orgId: string | null | undefined): boolean {
  if (!orgId) return false;
  return (WOLVERINE_CLERK_ORG_IDS as readonly string[]).includes(orgId);
}
