/**
 * Refuse to send a weekly driver report built on mixed data sources.
 *
 * Motive support (case 11057761) confirmed that v2/driver_utilization and the
 * Fleet Dashboard report use different calculation models and must not be
 * combined. The scorecard honours that within a single week: a week is served
 * wholly from the report or wholly from the API, never blended.
 *
 * The weekly card spans FOUR weeks, though, as a trend and a four week average.
 * If three weeks come from the report and one falls back to the API, the card
 * itself becomes the blend Motive warned about, and for a yard driver the stale
 * week sits 20 to 30 idle points high. The driver reads that as a dramatic
 * improvement they did not make.
 *
 * So: once an org has any accepted report data, every week on the card must be
 * report-backed. Anything else aborts the send with a message naming the weeks
 * to pull, rather than delivering a misleading card.
 */
import { getAppPrisma } from '../../lib/prisma.js';

export class MixedReportSourceError extends Error {
  constructor(public readonly weeks: Array<{ weekStart: string; weekEnd: string; source: string | null }>) {
    const bad = weeks.map((w) => `${w.weekStart}..${w.weekEnd} (${w.source ?? 'no data'})`).join(', ');
    super(
      `Refusing to send: this org uses Motive's dashboard report, but ${weeks.length} of the four weeks on the card ` +
      `are not report-backed: ${bad}. Pull those windows (pnpm pull-motive-portal --window=START..END) and retry.`
    );
    this.name = 'MixedReportSourceError';
  }
}

/** True once any Motive report data has been accepted for this org. */
export async function orgUsesMotiveReport(clerkOrgId: string): Promise<boolean> {
  const hit = await getAppPrisma().motiveReportIngest.findFirst({
    where: { clerkOrgId, status: 'ACCEPTED' },
    select: { id: true },
  });
  return hit != null;
}

export async function assertReportBackedOrThrow(
  clerkOrgId: string,
  weekSources: Array<{ weekStart: string; weekEnd: string; source: string | null }>
): Promise<void> {
  if (!(await orgUsesMotiveReport(clerkOrgId))) return; // org still on the API everywhere; nothing to mix
  const notBacked = weekSources.filter((w) => w.source !== 'MOTIVE_REPORT');
  if (notBacked.length > 0) throw new MixedReportSourceError(notBacked);
}
