/**
 * PUBLIC REPORTS — tokenized weekly driver report.
 * No auth — drivers don't have Clerk accounts. Token is opaque (32-byte hex)
 * and expires 30 days after send. Returns the frozen kpiSnapshot captured at
 * send-time so the page renders consistently even if EIA prices or scorecard
 * aggregations change later.
 */

import { Router, Request, Response } from 'express';
import { getAppPrisma } from '../lib/prisma.js';

const router = Router();

router.get('/:token', async (req: Request, res: Response) => {
  const { token } = req.params;
  if (!token || token.length < 32 || token.length > 128) {
    return res.status(404).json({ error: 'Not Found' });
  }

  res.setHeader('Cache-Control', 'private, no-store');

  try {
    const prisma = getAppPrisma();
    const row = await prisma.driverWeeklyReportSent.findUnique({
      where: { token },
      select: {
        id: true,
        weekStartDate: true,
        sentAt: true,
        tokenExpiresAt: true,
        kpiSnapshot: true,
        isTest: true,
      },
    });

    if (!row) return res.status(404).json({ error: 'Not Found' });
    if (row.tokenExpiresAt.getTime() < Date.now()) {
      return res.status(410).json({ error: 'Gone', message: 'This report link has expired.' });
    }

    res.json({
      weekStart: row.weekStartDate,
      sentAt: row.sentAt.toISOString(),
      isTest: row.isTest,
      snapshot: row.kpiSnapshot,
    });
  } catch (err: any) {
    console.error('publicReports error', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;
