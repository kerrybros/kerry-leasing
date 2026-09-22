import { describe, it, expect } from 'vitest';
import {
  parseCsv,
  parseDriverFuelPerformanceCsv,
  ReportParseError,
  normalizeDriverName,
} from '../../../src/features/motiveReport/parseDriverFuelPerformanceCsv.js';

const HEADER =
  'Driver,Driver ID,Group,Vehicle,Avg. MPG,Moving MPG,Total Distance (mi),Total Fuel (gal),Est. Carbon Emissions (lbs),Utilization (%),Driving Time (mins),Driving Fuel (gal),Idling Time (mins),Idled Fuel (gal),Over RPM (%),Avg. Speed (mph),Fuel Cost (USD),Cruise Distance (%),Cruise Time (%),Hard Braking (events/1K mi),Hard Acceleration (events/1K mi),Hard Cornering (events/1K mi)';

// Real rows from the 2026-09-14 scheduled export (Wolverine).
const SAMPLE = `${HEADER}
Mohammed Morshed,"","",112,6.37,8.48,1.24,0.2,4.38,47.52,4.03,0.15,4.45,0.05,10.33,18.49,$1.16,0.0,0.0,0.0,0.0,0.0
Tre Jeknavorian,"","",115,3.78,4.96,27.96,7.41,166.21,44.66,150.85,5.64,186.91,1.77,5.07,11.12,$44.19,0.0,0.0,0.0,0.0,0.0
Chris  Gross,"","",111,4.66,5.98,1.86,0.4,8.99,75.65,13.88,0.31,4.47,0.09,0.24,8.06,$2.39,0.0,0.0,0.0,0.0,0.0
`;

describe('parseCsv', () => {
  it('handles quoted empties, doubled quotes, CRLF and a BOM', () => {
    const rows = parseCsv('﻿a,b,c\r\n"x, y","he said ""hi""",""\r\n');
    expect(rows).toEqual([['a', 'b', 'c'], ['x, y', 'he said "hi"', '']]);
  });
});

describe('parseDriverFuelPerformanceCsv', () => {
  it('parses the real Motive layout into typed rows', () => {
    const { headers, rows } = parseDriverFuelPerformanceCsv(SAMPLE);
    expect(headers).toHaveLength(22);
    expect(rows).toHaveLength(3);
    const tre = rows[1];
    expect(tre.driverName).toBe('Tre Jeknavorian');
    expect(tre.vehicleName).toBe('115');
    expect(tre.driverCompanyId).toBeNull();
    expect(tre.drivingTimeMin).toBeCloseTo(150.85);
    expect(tre.idlingTimeMin).toBeCloseTo(186.91);
    expect(tre.idledFuelGal).toBeCloseTo(1.77);
    expect(tre.totalDistanceMi).toBeCloseTo(27.96);
    expect(tre.totalFuelGal).toBeCloseTo(7.41);
    expect(tre.fuelCostUsd).toBeCloseTo(44.19); // "$44.19" → number
    expect(tre.raw['Fuel Cost (USD)']).toBe('$44.19');
  });

  it("matches Motive's utilization formula on the parsed fields", () => {
    const { rows } = parseDriverFuelPerformanceCsv(SAMPLE);
    for (const r of rows) {
      const util = (r.drivingTimeMin! / (r.drivingTimeMin! + r.idlingTimeMin!)) * 100;
      expect(util).toBeCloseTo(r.utilizationPct!, 1);
    }
  });

  it('normalizes driver names (case + whitespace) for matching', () => {
    const { rows } = parseDriverFuelPerformanceCsv(SAMPLE);
    expect(rows[2].driverName).toBe('Chris  Gross');
    expect(rows[2].driverNormalizedName).toBe('chris gross');
    expect(normalizeDriverName('  ROB   Zimmerman ')).toBe('rob zimmerman');
  });

  it('fails loudly when a required column disappears', () => {
    const broken = SAMPLE.replace('Driving Time (mins)', 'Drive Time');
    expect(() => parseDriverFuelPerformanceCsv(broken)).toThrow(ReportParseError);
    expect(() => parseDriverFuelPerformanceCsv(broken)).toThrow(/Driving Time \(mins\)/);
  });

  it('fails on a non-numeric metric cell', () => {
    const broken = SAMPLE.replace('150.85', 'n/a-ish');
    expect(() => parseDriverFuelPerformanceCsv(broken)).toThrow(/not numeric/);
  });

  it('fails on a ragged row', () => {
    const broken = SAMPLE.replace(',0.0,0.0,0.0\nChris', '\nChris');
    expect(() => parseDriverFuelPerformanceCsv(broken)).toThrow(/expected 22 cells/);
  });

  it('rejects an empty file', () => {
    expect(() => parseDriverFuelPerformanceCsv('')).toThrow(/empty/);
  });
});
