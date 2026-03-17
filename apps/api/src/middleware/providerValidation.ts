/**
 * Provider Validation Middleware
 * 
 * Ensures the org's configured telematics provider matches the expected provider
 * Use this for provider-specific endpoints to prevent confusion
 */

import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.js';
import { getAppPrisma } from '../lib/prisma.js';
import { TelematicsProvider } from '../telematics/types.js';

/**
 * Middleware to require a specific telematics provider
 * Returns 403 if org's provider doesn't match
 * 
 * @param expectedProvider - The provider required for this endpoint (MOTIVE or SAMSARA)
 */
export function requireProvider(expectedProvider: TelematicsProvider) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const clerkOrgId = req.auth?.orgId;

      if (!clerkOrgId) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Organization context required',
        });
      }

      const appClient = getAppPrisma();

      // Check org's configured provider
      const providerAccount = await appClient.telematicsProviderAccount.findUnique({
        where: { clerkOrgId },
        select: { provider: true },
      });

      if (!providerAccount) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'No telematics provider configured for this organization',
        });
      }

      if (providerAccount.provider !== expectedProvider) {
        return res.status(403).json({
          error: 'Provider Mismatch',
          message: `This endpoint requires ${expectedProvider} but your organization uses ${providerAccount.provider}`,
          configuredProvider: providerAccount.provider,
          requiredProvider: expectedProvider,
        });
      }

      // Provider matches, continue
      next();
    } catch (error) {
      console.error('Provider validation error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to validate telematics provider',
      });
    }
  };
}
