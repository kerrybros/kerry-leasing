/**
 * CRON ENDPOINTS
 * Protected endpoints for triggering sync jobs manually or via external scheduler
 */

import { Router, Request, Response } from 'express';
import { syncMotiveDaily } from '../telematics/motive/syncService.js';

const router = Router();

/**
 * POST /api/cron/sync-motive
 * Triggers the Motive daily sync
 * 
 * Authentication: x-cron-secret header must match CRON_SECRET env var
 * 
 * Usage:
 *   curl -X POST https://your-api.onrender.com/api/cron/sync-motive \
 *     -H "x-cron-secret: your-secret-key"
 */
router.post('/sync-motive', async (req: Request, res: Response) => {
  try {
    // 1. Verify secret token
    const token = req.headers['x-cron-secret'];
    const expectedSecret = process.env.CRON_SECRET;

    if (!expectedSecret) {
      console.error('CRON_SECRET not configured');
      return res.status(500).json({ 
        error: 'Server configuration error',
        message: 'CRON_SECRET not set'
      });
    }

    if (token !== expectedSecret) {
      console.warn(`Unauthorized cron attempt from ${req.ip}`);
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Invalid cron secret'
      });
    }

    console.log(`\n✅ Authorized cron request from ${req.ip}`);

    // 2. Respond immediately (non-blocking)
    res.status(202).json({ 
      message: 'Motive sync started',
      timestamp: new Date().toISOString()
    });

    // 3. Run sync in background (don't await)
    syncMotiveDaily()
      .then(result => {
        console.log(`✅ Sync completed: ${result.successCount}/${result.totalOrgs} orgs successful`);
      })
      .catch(error => {
        console.error(`❌ Sync failed:`, error);
      });
  } catch (error: any) {
    console.error('Cron endpoint error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message
    });
  }
});

/**
 * GET /api/cron/health
 * Health check for cron endpoints
 */
router.get('/health', (req: Request, res: Response) => {
  res.json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'cron-endpoints'
  });
});

export default router;
