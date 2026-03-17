/**
 * Telematics provider utilities (credential validation for admin configure).
 */

import { TelematicsProvider } from '../types.js';

/**
 * Validate credentials structure for a provider.
 * Used by POST /admin/telematics/configure.
 */
export function validateCredentials(
  provider: TelematicsProvider,
  credentials: unknown
): boolean {
  if (typeof credentials !== 'object' || credentials === null) return false;
  const c = credentials as Record<string, unknown>;
  switch (provider) {
    case TelematicsProvider.SAMSARA:
      return typeof c.apiToken === 'string' && c.apiToken.length > 0;
    case TelematicsProvider.MOTIVE:
      return typeof c.apiKey === 'string' && c.apiKey.length > 0;
    default:
      return false;
  }
}
