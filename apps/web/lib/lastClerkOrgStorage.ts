const STORAGE_KEY = 'kl_last_clerk_org_id';

function isValidClerkOrgId(id: string): boolean {
  return id.startsWith('org_') && id.length > 4;
}

export function getLastClerkOrgId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && isValidClerkOrgId(raw)) return raw;
  } catch {
    /* ignore */
  }
  return null;
}

export function setLastClerkOrgId(orgId: string | null | undefined): void {
  if (typeof window === 'undefined') return;
  try {
    if (orgId && isValidClerkOrgId(orgId)) {
      localStorage.setItem(STORAGE_KEY, orgId);
    }
  } catch {
    /* ignore */
  }
}

export function clearLastClerkOrgId(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
