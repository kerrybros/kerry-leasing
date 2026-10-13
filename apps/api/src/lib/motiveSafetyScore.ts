/**
 * MOTIVE SAFETY SCORE: WHAT A ZERO MEANS
 *
 * Motive returns `score: 0` for a driver it has no score for yet, not for a
 * driver who scored zero. Treating that 0 as a real score puts a brand new
 * driver at the bottom of the fleet with the worst possible number.
 *
 * Evidence (Wolverine, 2026-10-13): 682 of 11,744 stored scorecard rows carry
 * score 0, and between them they hold 30 safety events in total, against 718
 * events across the 11,062 scored rows. A driver with no hard brakes, no hard
 * accelerations and no hard corners cannot have earned a zero. Brandon
 * Stevenson first appears on 2026-09-30 and scores 0 every day through 10-10,
 * with real driving distance on each of those days, then Motive publishes his
 * first real score of 100 on 10-12. His raw payload on a zero day is
 * `{"score": 0, "num_hard_accels": 0, "num_hard_brakes": 0,
 * "num_hard_corners": 0, "total_kilometers": 254.55, "num_coached_events": 0}`.
 * Some drivers (Ken Gardhouse, 173 days) never receive a score at all.
 *
 * So a zero is absence of data. Everywhere we surface Motive's score we want
 * "no score yet" to read as a dash, which every caller already renders for
 * null, rather than as a zero the driver did not earn.
 *
 * A genuine Motive score of exactly 0 would need a catastrophic event rate, and
 * showing that rare driver a dash is a far smaller error than showing every new
 * driver a zero.
 */

/** Prisma filter: only rows carrying a score Motive actually computed. */
export const SCORED_ROWS_ONLY = { gt: 0 } as const;

/** True when Motive published a real score, rather than a 0 placeholder. */
export function isScored(score: number | null | undefined): score is number {
  return typeof score === 'number' && score > 0;
}
