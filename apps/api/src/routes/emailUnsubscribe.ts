/**
 * EMAIL UNSUBSCRIBE — public, tokenized opt-out for weekly report emails.
 *
 * No auth — drivers don't have Clerk accounts; the per-send token is the sole
 * identifier. Mutation is POST-only so email security scanners (which follow
 * links with GET) can't auto-unsubscribe a driver. Sets DriverContact
 * .emailOptedOut, which the dispatcher checks for the EMAIL channel only — the
 * SMS STOP opt-out (optedOut) is independent.
 */

import { Router, Request, Response } from 'express';
import { getAppPrisma } from '../lib/prisma.js';

const router = Router();

router.post('/:token', async (req: Request, res: Response) => {
  const { token } = req.params;
  if (!token || token.length < 32 || token.length > 128) {
    return res.status(404).json({ error: 'Not Found' });
  }

  try {
    const prisma = getAppPrisma();
    // Find the driver behind this token. Intentionally ignores token expiry —
    // an unsubscribe request should be honored even from an old email.
    const row = await prisma.driverWeeklyReportSent.findUnique({
      where: { token },
      select: { driverContactId: true },
    });
    if (!row) return res.status(404).json({ error: 'Not Found' });

    await prisma.driverContact.update({
      where: { id: row.driverContactId },
      data: { emailOptedOut: true, emailOptedOutAt: new Date() },
    });

    res.json({ ok: true });
  } catch (err: any) {
    console.error('emailUnsubscribe error', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;
