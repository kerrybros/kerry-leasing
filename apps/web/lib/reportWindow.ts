/**
 * Keep a requested date range inside the Motive report data we actually hold.
 *
 * Driver figures for a report-only customer come solely from the Motive
 * dashboard report. Report coverage is all-or-nothing across a range: ask for
 * one day we have no file for and the whole range serves nothing. So a request
 * that runs to "today", or to the end of the current month, or to no bound at
 * all, returns an empty page.
 *
 * That is how the drivers page went blank: it asked for everything since 2020.
 * The Fleet page and the driver detail page had the same shape.
 *
 * Clamping changes no figures. There is no data past the coverage edge, so the
 * same rows come back; only the asked-for window shrinks to one that can be
 * served from the report.
 */

export interface ReportCoverageBounds {
  reportCoverageFrom?: string | null;
  reportCoverageThrough?: string | null;
  requireReportBackedDriverData?: boolean;
}

export function clampToReportCoverage(
  startDate: string | undefined,
  endDate: string | undefined,
  bounds: ReportCoverageBounds | undefined,
): { startDate: string | undefined; endDate: string | undefined } {
  // Only report-only customers need this. Everyone else keeps API history,
  // which reaches further back than any report file.
  if (!bounds?.requireReportBackedDriverData) return { startDate, endDate };
  const from = bounds.reportCoverageFrom ?? null;
  const through = bounds.reportCoverageThrough ?? null;
  if (!from || !through) return { startDate, endDate };

  let s = startDate ?? from;
  let e = endDate ?? through;
  if (s < from) s = from;
  if (e > through) e = through;
  // A range entirely outside coverage would invert; serve the coverage edge
  // rather than a nonsense window.
  if (s > e) s = e;
  return { startDate: s, endDate: e };
}
