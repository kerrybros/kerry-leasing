/**
 * TELEMATICS PROVIDER FACTORY
 * 
 * Creates provider adapter instances based on configuration
 */

import type { ITelematicsProvider } from './IProvider.js';
import { SamsaraProvider } from './samsara.js';
import { MotiveProvider } from './motive.js';
import {
  TelematicsProvider,
  type SamsaraCredentials,
  type MotiveCredentials,
  type ProviderCredentials,
} from '../types.js';

/**
 * Create a provider adapter instance
 * 
 * @param provider - Provider type (SAMSARA or MOTIVE)
 * @param credentials - Provider-specific credentials
 * @returns Provider adapter instance
 */
export function createProvider(
  provider: TelematicsProvider,
  credentials: ProviderCredentials
): ITelematicsProvider {
  switch (provider) {
    case TelematicsProvider.SAMSARA:
      return new SamsaraProvider(credentials as SamsaraCredentials);
    
    case TelematicsProvider.MOTIVE:
      return new MotiveProvider(credentials as MotiveCredentials);
    
    default:
      throw new Error(`Unsupported telematics provider: ${provider}`);
  }
}

/**
 * Validate credentials structure for a provider
 */
export function validateCredentials(
  provider: TelematicsProvider,
  credentials: any
): boolean {
  switch (provider) {
    case TelematicsProvider.SAMSARA:
      return typeof credentials === 'object' && 
             typeof credentials.apiToken === 'string' &&
             credentials.apiToken.length > 0;
    
    case TelematicsProvider.MOTIVE:
      return typeof credentials === 'object' &&
             typeof credentials.apiKey === 'string' &&
             credentials.apiKey.length > 0;
    
    default:
      return false;
  }
}
