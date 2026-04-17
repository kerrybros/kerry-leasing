import { Router } from 'express';
import { clerkAuthMiddleware, requireRole, AuthRequest } from '../middleware/auth.js';
import { config } from '../config.js';
import { listDriveItems } from '../integrations/microsoft/graphClient.js';

const router = Router();

/**
 * GET /admin/sharepoint/drive-items
 * Lists files and folders in the configured SharePoint document library.
 * Requires internal Clerk role.
 *
 * Query params:
 *   path      - optional relative subfolder path (e.g. "Contracts/2025")
 *   next      - opaque next-page token (the raw @odata.nextLink from a prior response)
 */
router.get(
  '/drive-items',
  clerkAuthMiddleware,
  requireRole(['internal']),
  async (req: AuthRequest, res) => {
    if (!config.microsoftGraph) {
      return res.status(503).json({
        error: 'Service Unavailable',
        message:
          'Microsoft Graph integration is not configured. ' +
          'Set MICROSOFT_GRAPH_TENANT_ID and related env vars on the API service.',
      });
    }

    // Validate and sanitize path — reject traversal attempts
    const rawPath = typeof req.query.path === 'string' ? req.query.path.trim() : null;
    const folderPath = rawPath || null;
    if (folderPath && /(?:^|\/)\.\.(?:\/|$)/.test(folderPath)) {
      return res.status(400).json({ error: 'Bad Request', message: 'Path traversal not allowed.' });
    }

    const nextLink = typeof req.query.next === 'string' ? req.query.next.trim() || null : null;

    try {
      const result = await listDriveItems(config.microsoftGraph, folderPath, nextLink);

      res.json({
        items: result.items,
        nextPage: result.nextPage,
        path: folderPath ?? '',
        driveWebUrl: result.driveWebUrl,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[SharePoint] drive-items error:', message);

      if (message.includes('(403)')) {
        return res.status(502).json({
          error: 'Graph Forbidden',
          message:
            'Microsoft Graph returned 403. ' +
            'Ensure the app has been granted site-level access (Sites.Selected) ' +
            'and that tenant + path config is correct.',
        });
      }

      res.status(502).json({ error: 'Graph Error', message });
    }
  }
);

export default router;
