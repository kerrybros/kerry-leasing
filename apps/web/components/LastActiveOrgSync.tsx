'use client';

import { useEffect, useRef } from 'react';
import { useAuth, useOrganization, useOrganizationList } from '@clerk/nextjs';
import { clearLastClerkOrgId, getLastClerkOrgId, setLastClerkOrgId } from '@/lib/lastClerkOrgStorage';

/**
 * Persists the active Clerk org id to localStorage and restores it on the next
 * visit when the session has no active org. If there is a single membership,
 * selects that org when nothing valid is stored.
 * OrganizationSwitcher remains the primary way to switch orgs; this only sets
 * a sensible default after login.
 */
export function LastActiveOrgSync() {
  const { isSignedIn, userId, getToken } = useAuth();
  const { isLoaded: orgLoaded, organization } = useOrganization();
  const { isLoaded: listLoaded, setActive, userMemberships } = useOrganizationList({
    userMemberships: {
      pageSize: 100,
    },
  });

  const restoreDoneRef = useRef(false);
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (userId === prevUserIdRef.current) return;
    prevUserIdRef.current = userId ?? null;
    restoreDoneRef.current = false;
  }, [userId]);

  // Keep storage in sync whenever Clerk has an active org
  useEffect(() => {
    if (!isSignedIn || !orgLoaded) return;
    if (organization?.id) {
      setLastClerkOrgId(organization.id);
    }
  }, [isSignedIn, orgLoaded, organization?.id]);

  // Restore last org (or only org) when the session has no active organization
  useEffect(() => {
    if (!isSignedIn || !orgLoaded || !listLoaded) return;
    if (restoreDoneRef.current) return;
    if (organization) {
      restoreDoneRef.current = true;
      return;
    }
    if (!userMemberships) return;
    if (userMemberships.isLoading) return;

    const members = userMemberships.data;
    if (members === undefined) return;

    if (members.length === 0) {
      restoreDoneRef.current = true;
      return;
    }

    const memberOrgIds = new Set(members.map((m) => m.organization.id));
    const last = getLastClerkOrgId();

    const choose = () => {
      if (last && memberOrgIds.has(last)) {
        return setActive({ organization: last });
      }
      if (last) {
        clearLastClerkOrgId();
      }
      if (members.length === 1) {
        return setActive({ organization: members[0].organization.id });
      }
      return Promise.resolve();
    };

    void choose()
      .then(() => getToken?.({ skipCache: true }))
      .catch((e) => {
        console.warn('[LastActiveOrgSync] setActive or token refresh failed', e);
        clearLastClerkOrgId();
      })
      .finally(() => {
        restoreDoneRef.current = true;
      });
  }, [
    isSignedIn,
    orgLoaded,
    listLoaded,
    organization,
    userMemberships?.isLoading,
    userMemberships?.data,
    setActive,
    getToken,
  ]);

  return null;
}
