import { describe, it, expect } from 'vitest';
import { motiveUtilizationRowToSeconds } from '../../../src/telematics/motive/utilizationUnits.js';

describe('motiveUtilizationRowToSeconds', () => {
  it('converts stored minutes to the seconds the unit detail page expects', () => {
    // 90 idle minutes and 8 driving hours, as syncVehicleUtilization stores them.
    const row = { vin: 'X', idleTime: 90, drivingTime: 480, totalFuel: 40 };
    const out = motiveUtilizationRowToSeconds(row);
    expect(out.idleTime).toBe(5400);
    expect(out.drivingTime).toBe(28800);
    // The page shows idle hours as idleTime / 3600.
    expect(out.idleTime! / 3600).toBe(1.5);
  });

  it('keeps nulls and leaves the other fields alone', () => {
    const row = { vin: 'X', idleTime: null, drivingTime: null, totalFuel: 40 };
    expect(motiveUtilizationRowToSeconds(row)).toEqual(row);
  });

  it('keeps the idle ratio, so Idle % does not move', () => {
    const row = { idleTime: 60, drivingTime: 540 };
    const out = motiveUtilizationRowToSeconds(row);
    expect(out.idleTime! / (out.idleTime! + out.drivingTime!)).toBe(0.1);
  });
});
