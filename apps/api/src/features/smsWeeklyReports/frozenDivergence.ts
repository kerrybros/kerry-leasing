/**
 * DID THE WEEK MOVE AFTER WE FROZE IT?
 *
 * Freezing at 07:00 and dispatching at 10:00 guarantees the operator report and
 * the drivers' cards agree, because they are the same rows. It cannot guarantee
 * that both still agree with Motive: the 09:00 pull runs in between, and Motive
 * attributes driving to a driver days late.
 *
 * So we check, after dispatch, and tell the operator. Drivers keep the card
 * that was reviewed, which is the point of the split, and the one person who
 * needs to know that a figure moved finds out the same morning instead of
 * hearing it from a fleet admin.
 *
 * The comparison rebuilds the week through the same builder `prepare` used, so
 * any difference is a real change in the underlying data rather than an
 * artefact of computing it two different ways.
 */

import { getAppPrisma } from '../../lib/prisma.js';
import { buildWeeklyReports } from './weeklyReportBuilder.js';

export interface FrozenDivergence {
  displayName: string;
  field: 'miles' | 'idle %' | 'MPG' | 'idle fuel' | 'safety';
  frozen: number | null;
  fresh: number | null;
}

interface Snapshot {
  displayName?: string;
  motiveScore?: number | null;
  current?: { idlePct?: number; avgMpg?: number; totalMiles?: number; idleFuelGal?: number };
}

/** Big enough to matter to a driver reading their card, small enough to catch a missing day. */
const TOLERANCE: Record<FrozenDivergence['field'], number> = {
  miles: 1,
  'idle %': 0.5,
  MPG: 0.05,
  'idle fuel': 0.5,
  safety: 0.5,
};

export async function diffFrozenAgainstFresh(
  clerkOrgId: string,
  weekStart: string,
  now?: Date,
): Promise<FrozenDivergence[]> {
  const prisma = getAppPrisma();
  const frozen = await prisma.driverWeeklyReportSent.findMany({
    where: { clerkOrgId, weekStartDate: weekStart, isTest: false },
    select: { driverContactId: true, kpiSnapshot: true },
  });
  if (frozen.length === 0) return [];

  // dryRun: the rebuild is a read. Without it the builder reconciles
  // DriverContact as a side effect and a comparison would change the roster.
  const rebuilt = await buildWeeklyReports(clerkOrgId, now, { dryRun: true });
  const freshByContact = new Map(rebuilt.reports.map((r) => [r.driverContactId, r]));

  const seen = new Set<string>();
  const out: FrozenDivergence[] = [];
  for (const row of frozen) {
    if (seen.has(row.driverContactId)) continue; // one row per channel; compare once
    seen.add(row.driverContactId);
    const snap = (row.kpiSnapshot ?? {}) as Snapshot;
    const fresh = freshByContact.get(row.driverContactId);
    if (!fresh) continue;

    const pairs: Array<[FrozenDivergence['field'], number | null | undefined, number | null | undefined]> = [
      ['miles', snap.current?.totalMiles, fresh.current.totalMiles],
      ['idle %', snap.current?.idlePct, fresh.current.idlePct],
      ['MPG', snap.current?.avgMpg, fresh.current.avgMpg],
      ['idle fuel', snap.current?.idleFuelGal, fresh.current.idleFuelGal],
      ['safety', snap.motiveScore, fresh.motiveScore],
    ];
    for (const [field, a, b] of pairs) {
      const av = a ?? null;
      const bv = b ?? null;
      if (av == null && bv == null) continue;
      if (av == null || bv == null || Math.abs(av - bv) > TOLERANCE[field]) {
        out.push({
          displayName: snap.displayName ?? fresh.displayName,
          field,
          frozen: av,
          fresh: bv,
        });
      }
    }
  }
  return out;
}

/** One short block for the operator email. Empty string when nothing moved. */
export function formatDivergenceText(d: FrozenDivergence[]): string {
  if (d.length === 0) return '';
  const lines = d.map(
    (x) =>
      `  ${x.displayName}: ${x.field} ${x.frozen ?? 'none'} on the card, ${x.fresh ?? 'none'} in Motive now`,
  );
  return [
    `${d.length} figure${d.length === 1 ? '' : 's'} changed after the week was frozen.`,
    'Drivers received the reviewed card. This is for your awareness only.',
    '',
    ...lines,
  ].join('\n');
}
