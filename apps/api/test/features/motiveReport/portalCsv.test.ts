import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { portalRowsToCsv, fmtNum } from '../../../src/features/motiveReport/portalCsv.js';
import { parseDriverFuelPerformanceCsv } from '../../../src/features/motiveReport/parseDriverFuelPerformanceCsv.js';

const dir = new URL('./fixtures/', import.meta.url);
const portalJson = JSON.parse(readFileSync(new URL('portal-2026-09-13.json', dir), 'utf8'));
const emailedCsv = readFileSync(new URL('motive-email-2026-09-13.csv', dir), 'utf8');

/** Row order in Motive's file is not stable, so compare as sorted sets. Motive quotes empty cells ("") which csv parsing normalises. */
function normalized(csv: string): string[] {
  return csv.trim().split('\n').slice(1).map((l) => l.replace(/""/g, '')).sort();
}

describe('portalRowsToCsv', () => {
  it('reproduces the dashboard CSV export from the internal JSON, row for row', () => {
    const csv = portalRowsToCsv(portalJson);
    expect(csv.split('\n')[0]).toBe(emailedCsv.split('\n')[0]); // identical header
    expect(normalized(csv)).toEqual(normalized(emailedCsv));
  });

  it('produces a file the strict parser accepts with the same numbers', () => {
    const a = parseDriverFuelPerformanceCsv(portalRowsToCsv(portalJson)).rows;
    const b = parseDriverFuelPerformanceCsv(emailedCsv).rows;
    const key = (r: any) => `${r.driverNormalizedName}|${r.vehicleName}`;
    const bm = new Map(b.map((r) => [key(r), r]));
    expect(a).toHaveLength(b.length);
    for (const r of a) {
      const o = bm.get(key(r))!;
      expect(o).toBeDefined();
      expect(r.drivingTimeMin).toBe(o.drivingTimeMin);
      expect(r.idlingTimeMin).toBe(o.idlingTimeMin);
      expect(r.idledFuelGal).toBe(o.idledFuelGal);
      expect(r.totalDistanceMi).toBe(o.totalDistanceMi);
      expect(r.totalFuelGal).toBe(o.totalFuelGal);
    }
  });

  it("matches Motive's number formatting", () => {
    expect(fmtNum(0.2)).toBe('0.2');
    expect(fmtNum(0)).toBe('0.0');
    expect(fmtNum(150.849)).toBe('150.85');
    expect(fmtNum(33)).toBe('33.0');
    expect(fmtNum(null)).toBe('');
  });
});
