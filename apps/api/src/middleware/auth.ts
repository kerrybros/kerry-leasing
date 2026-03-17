import { Request, Response, NextFunction } from 'express';
import { createClerkClient, verifyToken } from '@clerk/backend';
import { config } from '../config.js';

// Initialize Clerk client
const clerkClient = createClerkClient({
  secretKey: config.clerk.secretKey,
});

// Extend Express Request type to include auth context
export interface AuthRequest extends Request {
  auth?: {
    userId: string;
    orgId: string | null;
    role: 'internal' | 'external';
  };
}

/**
 * Middleware to verify Clerk JWT token and extract auth context
 * This uses Clerk's recommended backend verification approach
 * Updated: 2026-02-05 - Added dev mode bypass for header fallback
 */
export async function clerkAuthMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Missing or invalid Authorization header',
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify the token using Clerk's verifyToken method
    const verified = await verifyToken(token, {
      secretKey: config.clerk.secretKey,
    });

    if (config.nodeEnv === 'development') {
      console.log('Token verified. Claims:', {
        sub: verified.sub,
        org_id: verified.org_id,
        org_role: verified.org_role,
        org_slug: verified.org_slug,
      });
    }

    if (!verified || !verified.sub) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid token',
      });
    }

    const userId = verified.sub;

    // Get active organization from the token OR from header (fallback for dev mode)
    let orgId: string | null = null;
    let role: 'internal' | 'external' = 'external';

    // Check if org_id is in the token claims
    if (verified.org_id) {
      orgId = verified.org_id as string;
    }
    
    // Fallback: check for x-organization-id header (for Clerk dev mode)
    if (!orgId) {
      const headerOrgId = req.headers['x-organization-id'] as string | undefined;
      if (headerOrgId) {
        if (config.nodeEnv === 'development') {
          console.log('Using org_id from header:', headerOrgId);
        }
        orgId = headerOrgId;
      }
    }

    // Get org role if orgId exists
    if (orgId) {
      try {
        const orgMemberships = await clerkClient.users.getOrganizationMembershipList({
          userId,
        });
        
        const currentOrgMembership = orgMemberships.data.find(
          (membership) => membership.organization.id === orgId
        );

        if (currentOrgMembership) {
          // Map Clerk roles to our internal/external system
          // Clerk can return either "admin" or "org:admin" depending on context
          const clerkRole = currentOrgMembership.role;
          role = (clerkRole === 'org:admin' || clerkRole === 'admin') ? 'internal' : 'external';
          if (config.nodeEnv === 'development') {
            console.log(`User role in org ${orgId}: ${clerkRole} → ${role}`);
          }
        } else if (req.headers['x-organization-id'] && config.nodeEnv !== 'production') {
          // DEV/STAGING ONLY: header fallback + no membership found → grant internal for testing
          console.log('⚠️  DEV MODE: Granting internal role via header fallback');
          role = 'internal';
        }
      } catch (err) {
        console.error('Error fetching org memberships:', err);
        // DEV/STAGING ONLY: Clerk API error + header fallback → grant internal for testing
        if (req.headers['x-organization-id'] && config.nodeEnv !== 'production') {
          console.log('⚠️  DEV MODE: Granting internal role due to membership fetch error');
          role = 'internal';
        }
      }
    }

    // Attach auth context to request
    req.auth = {
      userId,
      orgId,
      role,
    };

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Token verification failed',
    });
  }
}

/**
 * Middleware to require organization context
 * Use this for routes that must have an active organization
 */
export function requireOrg(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.auth) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication required',
    });
  }

  if (!req.auth.orgId) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Organization context required. Please select an organization.',
    });
  }

  next();
}

/**
 * Middleware factory to require specific role
 */
export function requireRole(allowedRoles: Array<'internal' | 'external'>) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.auth) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    }

    if (!allowedRoles.includes(req.auth.role)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `Insufficient permissions. Required roles: ${allowedRoles.join(', ')}`,
      });
    }

    next();
  };
}
