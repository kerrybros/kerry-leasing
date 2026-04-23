/**
 * Inclusive calendar days from order created through order closed (Y-M-D strings).
 * `orderClosedYmd` is the latest `date_action_completed` date for the job.
 * Same calendar day = 1. Returns null if either date is missing or closed is before open.
 */
export function daysJobOpenInclusive(
  orderCreatedYmd: string | null | undefined,
  orderClosedYmd: string | null | undefined
): number | null {
  if (!orderCreatedYmd || !orderClosedYmd) return null;
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(orderCreatedYmd) || !re.test(orderClosedYmd)) return null;
  const [y1, m1, d1] = orderCreatedYmd.split('-').map(Number);
  const [y2, m2, d2] = orderClosedYmd.split('-').map(Number);
  const start = new Date(y1, m1 - 1, d1);
  const end = new Date(y2, m2 - 1, d2);
  const diffDays = Math.round((end.getTime() - start.getTime()) / 86400000);
  if (diffDays < 0) return null;
  return diffDays + 1;
}

/** Format API Y-M-D in the user's locale without UTC off-by-one (Date-only strings parse as UTC in JS). */
export function formatYmdForDisplay(ymd: string | null | undefined): string {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return '—';
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString();
}
