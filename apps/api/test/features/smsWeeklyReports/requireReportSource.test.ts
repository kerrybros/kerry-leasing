import { describe, it, expect, vi, beforeEach } from 'vitest';

const findFirst = vi.fn();
vi.mock('../../../src/lib/prisma.js', () => ({
  getAppPrisma: () => ({ motiveReportIngest: { findFirst } }),
}));

const { assertReportBackedOrThrow, MixedReportSourceError, orgUsesMotiveReport } =
  await import('../../../src/features/smsWeeklyReports/requireReportSource.js');

const REPORT = 'MOTIVE_REPORT';
const week = (weekStart: string, weekEnd: string, source: string | null) => ({ weekStart, weekEnd, source });
const fourGoodWeeks = [
  week('2026-08-31', '2026-09-06', REPORT),
  week('2026-09-07', '2026-09-13', REPORT),
  week('2026-09-14', '2026-09-20', REPORT),
  week('2026-09-21', '2026-09-27', REPORT),
];

beforeEach(() => findFirst.mockReset());

describe('assertReportBackedOrThrow', () => {
  it('allows a send when every week came from the report', async () => {
    findFirst.mockResolvedValue({ id: 'x' });
    await expect(assertReportBackedOrThrow('org', fourGoodWeeks)).resolves.toBeUndefined();
  });

  it('blocks when the oldest trend week quietly fell back to the API', async () => {
    findFirst.mockResolvedValue({ id: 'x' });
    const weeks = [week('2026-08-31', '2026-09-06', 'MOTIVE_API'), ...fourGoodWeeks.slice(1)];
    await expect(assertReportBackedOrThrow('org', weeks)).rejects.toThrow(MixedReportSourceError);
  });

  it('blocks when the current week itself is not report-backed', async () => {
    findFirst.mockResolvedValue({ id: 'x' });
    const weeks = [...fourGoodWeeks.slice(0, 3), week('2026-09-21', '2026-09-27', 'MOTIVE_API')];
    await expect(assertReportBackedOrThrow('org', weeks)).rejects.toThrow(/2026-09-21\.\.2026-09-27/);
  });

  it('blocks when a week has no data at all', async () => {
    findFirst.mockResolvedValue({ id: 'x' });
    const weeks = [week('2026-08-31', '2026-09-06', null), ...fourGoodWeeks.slice(1)];
    await expect(assertReportBackedOrThrow('org', weeks)).rejects.toThrow(/no data/);
  });

  it('names every offending week and how to fix it', async () => {
    findFirst.mockResolvedValue({ id: 'x' });
    const weeks = [
      week('2026-08-31', '2026-09-06', 'MOTIVE_API'),
      week('2026-09-07', '2026-09-13', 'MOTIVE_API'),
      ...fourGoodWeeks.slice(2),
    ];
    const err = await assertReportBackedOrThrow('org', weeks).catch((e) => e);
    expect(err.message).toContain('2026-08-31..2026-09-06');
    expect(err.message).toContain('2026-09-07..2026-09-13');
    expect(err.message).toContain('pull-motive-portal');
    expect(err.weeks).toHaveLength(2);
  });

  it('leaves an org that has no report data alone, so Samsara and API-only orgs still send', async () => {
    findFirst.mockResolvedValue(null);
    const weeks = fourGoodWeeks.map((w) => ({ ...w, source: 'MOTIVE_API' }));
    await expect(assertReportBackedOrThrow('org', weeks)).resolves.toBeUndefined();
  });

  it('treats an org with any accepted ingest as report-backed', async () => {
    findFirst.mockResolvedValue({ id: 'x' });
    expect(await orgUsesMotiveReport('org')).toBe(true);
    findFirst.mockResolvedValue(null);
    expect(await orgUsesMotiveReport('org')).toBe(false);
  });
});
