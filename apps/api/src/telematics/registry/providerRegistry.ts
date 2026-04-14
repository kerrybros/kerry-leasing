/**
 * PROVIDER REGISTRY
 *
 * Maps provider identifiers to their sync orchestration functions.
 * This is the single place that knows about all registered providers.
 *
 * Adding a new provider:
 *   1. Import its syncDaily and syncOrgForDate from the new syncService
 *   2. Add one entry to the registry object below
 *   That's it — cron routes and admin endpoints work automatically.
 *
 * See TELEMATICS_ARCHITECTURE.md for the full provider onboarding guide.
 */

import {
  syncMotiveDaily,
  syncMotiveOrgForDate,
} from '../motive/syncService.js';
import {
  syncSamsaraDaily,
  syncSamsaraOrgForDate,
} from '../samsara/syncService.js';

export type ProviderName = 'MOTIVE' | 'SAMSARA';

export interface ProviderSyncFunctions {
  /**
   * Daily sync entry point: reads all active orgs for this provider,
   * processes them sequentially, runs primary + verify passes.
   */
  syncDaily(): Promise<{
    totalOrgs: number;
    successCount: number;
    errorCount: number;
    duration: number;
  }>;

  /**
   * Single-org, single-date sync. Used by manual triggers, backfill
   * scripts, and the admin cron endpoint.
   */
  syncOrgForDate(
    clerkOrgId: string,
    apiCredential: string,
    date: string,
    verify?: boolean
  ): Promise<{
    clerkOrgId: string;
    success: boolean;
    date: string;
    duration: number;
    error?: string;
  }>;
}

const registry: Record<ProviderName, ProviderSyncFunctions> = {
  MOTIVE: {
    syncDaily: syncMotiveDaily,
    syncOrgForDate: (clerkOrgId, apiKey, date, verify) =>
      syncMotiveOrgForDate(clerkOrgId, apiKey, date, verify),
  },
  SAMSARA: {
    syncDaily: syncSamsaraDaily,
    syncOrgForDate: (clerkOrgId, apiToken, date, verify) =>
      syncSamsaraOrgForDate(clerkOrgId, apiToken, date, verify),
  },
  // Future providers:
  // GEOTAB: {
  //   syncDaily: syncGeotabDaily,
  //   syncOrgForDate: (clerkOrgId, credential, date, verify) =>
  //     syncGeotabOrgForDate(clerkOrgId, credential, date, verify),
  // },
};

/**
 * Returns the sync functions for the given provider.
 * Throws if the provider is not registered.
 */
export function getProviderSync(provider: ProviderName): ProviderSyncFunctions {
  const sync = registry[provider];
  if (!sync) {
    throw new Error(
      `Unknown telematics provider: "${provider}". ` +
      `Registered providers: ${Object.keys(registry).join(', ')}`
    );
  }
  return sync;
}

/**
 * Returns all registered provider names.
 * Useful for admin status endpoints that need to enumerate providers.
 */
export function getRegisteredProviders(): ProviderName[] {
  return Object.keys(registry) as ProviderName[];
}
