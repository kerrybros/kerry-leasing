'use client';

import { useAuth, useOrganization } from '@clerk/nextjs';
import { useCallback } from 'react';
import { createApiClient } from '@/lib/api';

export type ApiClient = ReturnType<typeof createApiClient>;

/**
 * Returns a function that builds an API client with the current auth token
 * and organization ID (x-organization-id header when present).
 * Use this so all API calls use a consistent auth/org context.
 */
export function useApiClient() {
  const { getToken } = useAuth();
  const { organization } = useOrganization();

  const getApi = useCallback(async (): Promise<ApiClient> => {
    const token = await getToken();
    const headers: Record<string, string> = {};
    if (organization?.id) {
      headers['x-organization-id'] = organization.id;
    }
    return createApiClient(token, headers);
  }, [getToken, organization?.id]);

  return { getApi };
}
