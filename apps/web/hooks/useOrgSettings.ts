'use client';

import { useState, useCallback } from 'react';
import { ApiError } from '@/lib/api';
import type { ApiClient } from './useApiClient';

export type OrgSettings = {
  tracksDrivers: boolean;
  telematicsProvider: 'MOTIVE' | 'SAMSARA' | null;
};

const defaultOrgSettings: OrgSettings = {
  tracksDrivers: true,
  telematicsProvider: null,
};

/**
 * Loads and caches organization settings from /org/settings.
 * On failure, sets error message and returns default settings (behavior unchanged from original).
 */
export function useOrgSettings(getApi: () => Promise<ApiClient>) {
  const [orgSettings, setOrgSettings] = useState<OrgSettings>(defaultOrgSettings);
  const [orgSettingsError, setOrgSettingsError] = useState<string | null>(null);

  const loadOrgSettings = useCallback(async (): Promise<OrgSettings> => {
    try {
      const api = await getApi();
      const settings = await api.get<OrgSettings>('/org/settings');
      setOrgSettings(settings);
      setOrgSettingsError(null);
      return settings;
    } catch (err) {
      console.error('[OrgSettings] Failed to load settings:', err);
      setOrgSettingsError(
        err instanceof ApiError ? err.message : 'Failed to load settings. Using defaults.'
      );
      setOrgSettings(defaultOrgSettings);
      return defaultOrgSettings;
    }
  }, [getApi]);

  const clearOrgSettingsError = useCallback(() => {
    setOrgSettingsError(null);
  }, []);

  return { orgSettings, orgSettingsError, loadOrgSettings, clearOrgSettingsError };
}
