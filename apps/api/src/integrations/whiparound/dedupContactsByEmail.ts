/**
 * Email-based DriverContact deduplication.
 *
 * Why: two separate DriverContact rows can end up with the same email when
 *  - WP sync runs before Motive-side rows have email populated, creating a
 *    new WHIPAROUND_SYNC row instead of merging into the existing one
 *  - admin manually adds a driver who already exists from a sync source
 *
 * Strategy: for each (org, email) that appears on 2+ rows, pick a winner
 * and merge the rest into it. Winner gets any missing fields from losers
 * (motiveDriverId, whiparoundDriverId, phone, normalizedName). Send
 * history rows on losers are re-pointed to the winner. Losers are deleted.
 *
 * Winner selection priority (highest first):
 *   1. Has both motiveDriverId and whiparoundDriverId
 *   2. Has more linkage (sum of: hasMotive ? 2 : 0  +  hasWp ? 2 : 0  +  isManual ? 1 : 0)
 *   3. Older row (lower createdAt) — its id is likelier already referenced elsewhere
 */

import { getAppPrisma } from '../../lib/prisma.js';
import type { DriverContactSource } from '../../generated/app-client/index.js';

interface DedupResult {
  emailsScanned: number;
  duplicateGroups: number;
  rowsMerged: number;
  errors: number;
}

interface ContactRow {
  id: string;
  displayName: string;
  normalizedName: string;
  email: string | null;
  phoneE164: string | null;
  motiveDriverId: number | null;
  whiparoundDriverId: number | null;
  source: DriverContactSource;
  enrolled: boolean;
  optedOut: boolean;
  createdAt: Date;
}

function linkageScore(c: ContactRow): number {
  return (
    (c.motiveDriverId != null ? 2 : 0) +
    (c.whiparoundDriverId != null ? 2 : 0) +
    (c.source === 'MANUAL' ? 1 : 0)
  );
}

export async function dedupContactsByEmail(clerkOrgId: string): Promise<DedupResult> {
  const prisma = getAppPrisma();

  // Group counts via groupBy don't work cleanly with Prisma's having clause
  // on a nullable field across versions — pull all populated emails and
  // group in memory. Small N per org so this is fine.
  const all = await prisma.driverContact.findMany({
    where: { clerkOrgId, email: { not: null } },
    select: {
      id: true, displayName: true, normalizedName: true, email: true, phoneE164: true,
      motiveDriverId: true, whiparoundDriverId: true, source: true,
      enrolled: true, optedOut: true, createdAt: true,
    },
  });

  const byEmail = new Map<string, ContactRow[]>();
  for (const row of all) {
    if (!row.email) continue;
    const list = byEmail.get(row.email) ?? [];
    list.push(row);
    byEmail.set(row.email, list);
  }

  let duplicateGroups = 0;
  let rowsMerged = 0;
  let errors = 0;

  for (const [email, rows] of byEmail) {
    if (rows.length < 2) continue;
    duplicateGroups++;

    // Sort: highest linkage first; ties broken by oldest createdAt
    rows.sort((a, b) => {
      const diff = linkageScore(b) - linkageScore(a);
      if (diff !== 0) return diff;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
    const winner = rows[0];
    const losers = rows.slice(1);

    for (const loser of losers) {
      // Build a patch of winner-missing fields the loser can fill.
      const patch: Record<string, unknown> = {};
      if (winner.motiveDriverId == null && loser.motiveDriverId != null) {
        patch.motiveDriverId = loser.motiveDriverId;
      }
      if (winner.whiparoundDriverId == null && loser.whiparoundDriverId != null) {
        patch.whiparoundDriverId = loser.whiparoundDriverId;
      }
      if (!winner.phoneE164 && loser.phoneE164) {
        patch.phoneE164 = loser.phoneE164;
      }
      // If the loser was MANUAL and the winner is sync-sourced, surface
      // that the winner now represents an admin-confirmed identity.
      if (loser.source === 'MANUAL' && winner.source !== 'MANUAL') {
        patch.source = 'MANUAL';
      }

      try {
        await prisma.$transaction([
          prisma.driverWeeklyReportSent.updateMany({
            where: { clerkOrgId, driverContactId: loser.id },
            data: { driverContactId: winner.id },
          }),
          prisma.driverContact.delete({ where: { id: loser.id } }),
          ...(Object.keys(patch).length
            ? [prisma.driverContact.update({ where: { id: winner.id }, data: patch })]
            : []),
        ]);
        console.log(
          `[Whiparound dedup] merged ${loser.displayName} (id=${loser.id}) → ${winner.displayName} (id=${winner.id}) on email=${email}`,
        );
        rowsMerged++;
      } catch (err: any) {
        errors++;
        console.warn(
          `[Whiparound dedup] failed to merge ${loser.displayName} → ${winner.displayName}: ${err.message}`,
        );
      }
    }
  }

  return {
    emailsScanned: byEmail.size,
    duplicateGroups,
    rowsMerged,
    errors,
  };
}
