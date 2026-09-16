/**
 * MOTIVE LOOKBACK WINDOW
 *
 * Motive does not finalize a day's data all at once. Idle events, driver
 * utilization, and driving periods can keep arriving for several days after
 * the calendar day ends (ELD upload lag, reprocessing, driver reassignment).
 *
 * Observed case (Sept 2026): for 2026-07-16 the daily sync stored 623 idle
 * events on Jul 17, three of them with driver: null. Motive assigned driver
 * 5494617 to those three later. The single verify pass four days later saw
 * them, but change detection ignored the driver fields (fixed in
 * syncIdleEvents), and no later run ever looked at that day again. The
 * driver's utilization rollup also kept moving after the verify pass
 * (146.9 idle minutes on Jul 20, 213.9 on Sept 16), so one verify day is not
 * enough on its own.
 *
 * The fix is a window, not a single day: every daily run re-syncs each day
 * from `LOOKBACK_START_DAYS` ago through `LOOKBACK_END_DAYS` ago with
 * verify=true. Each verify pass re-fetches the full day list from Motive, so
 * ids that were not present on earlier runs are inserted and rollups such as
 * driver utilization are re-pulled and updated when they changed.
 *
 * The window end is overridable with MOTIVE_LOOKBACK_DAYS (integer, days).
 */

import { getDaysAgoEastern } from '../dates.js';

/** First verify day. Yesterday is the primary (non-verify) pass. */
export const MOTIVE_LOOKBACK_START_DAYS = 2;

/** Last verify day (inclusive) when MOTIVE_LOOKBACK_DAYS is not set. */
export const MOTIVE_DEFAULT_LOOKBACK_DAYS = 7;

/** Hard ceiling so a typo in the env var cannot turn the cron into a full backfill. */
export const MOTIVE_MAX_LOOKBACK_DAYS = 30;

export interface MotiveSyncPass {
  /** YYYY-MM-DD in Eastern time. */
  date: string;
  /** True for lookback passes (bumps lastVerifiedAt on unchanged rows). */
  verify: boolean;
  /** How many days before "today" (Eastern) this pass covers. 1 = yesterday. */
  daysAgo: number;
}

/**
 * Resolve the last lookback day (inclusive) from the environment.
 * Falls back to the default on a missing, non-numeric, or out-of-range value.
 */
export function resolveMotiveLookbackDays(
  env: NodeJS.ProcessEnv = process.env
): number {
  const raw = env.MOTIVE_LOOKBACK_DAYS;
  if (raw == null || raw.trim() === '') return MOTIVE_DEFAULT_LOOKBACK_DAYS;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return MOTIVE_DEFAULT_LOOKBACK_DAYS;
  if (parsed < MOTIVE_LOOKBACK_START_DAYS) return MOTIVE_LOOKBACK_START_DAYS;
  if (parsed > MOTIVE_MAX_LOOKBACK_DAYS) return MOTIVE_MAX_LOOKBACK_DAYS;
  return parsed;
}

/**
 * Build the ordered list of passes for one daily run.
 *
 * Order is newest first: yesterday (primary), then 2 days ago, 3 days ago, and
 * so on through `lookbackDays` ago. Newest first means the most valuable data
 * lands even if a later pass fails or the job is killed.
 */
export function planMotiveDailyPasses(
  now: Date = new Date(),
  lookbackDays: number = resolveMotiveLookbackDays()
): MotiveSyncPass[] {
  const passes: MotiveSyncPass[] = [
    { date: getDaysAgoEastern(1, now), verify: false, daysAgo: 1 },
  ];
  const end = Math.min(Math.max(lookbackDays, MOTIVE_LOOKBACK_START_DAYS), MOTIVE_MAX_LOOKBACK_DAYS);
  for (let daysAgo = MOTIVE_LOOKBACK_START_DAYS; daysAgo <= end; daysAgo++) {
    passes.push({ date: getDaysAgoEastern(daysAgo, now), verify: true, daysAgo });
  }
  return passes;
}
