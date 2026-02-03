import { Request, Response, NextFunction } from 'express';
import { createClerkClient } from '@clerk/backend';
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

    // Verify the token using Clerk
    const verified = await clerkClient.verifyToken(token);

    if (!verified || !verified.sub) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid token',
      });
    }

    const userId = verified.sub;

    // Get active organization from the token or user's primary org
    let orgId: string | null = null;
    let role: 'internal' | 'external' = 'external';

    // Check if org_id is in the token claims
    if (verified.org_id) {
      orgId = verified.org_id as string;
    }

    // Get org role if orgId exists
    if (orgId) {
      const orgMemberships = await clerkClient.users.getOrganizationMembershipList({
        userId,
      });
      
      const currentOrgMembership = orgMemberships.data.find(
        (membership) => membership.organization.id === orgId
      );

      if (currentOrgMembership) {
        // Map Clerk roles to our internal/external system
        // Adjust this based on your Clerk role configuration
        role = currentOrgMembership.role === 'org:admin' ? 'internal' : 'external';
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
