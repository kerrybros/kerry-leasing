import { describe, it, expect } from 'vitest';
import {
  filterByDateRange,
  aggregateUnitMetrics,
  aggregateDriverMetrics,
  aggregateFleetKpis,
  buildUnitOptions,
  buildDriverOptions,
} from './aggregations';
import type { VehicleUtilization, DriverUtilization } from '@/hooks/useDataQueries';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeVehicle = (overrides: Partial<VehicleUtilization> = {}): VehicleUtilization => ({
  vehicleId: 1,
  vehicleNumber: 'UNIT-001',
  vin: '1HTMM2AK0AH123456',
  date: '2024-01-15',
  totalDistance: 500,
  idleTime: 3600,      // 60 min
  drivingTime: 32400,  // 9 hrs
  totalFuel: 100,
  idleFuel: 5,
  ...overrides,
});

const makeDriver = (overrides: Partial<DriverUtilization> = {}): DriverUtilization => ({
  driverId: 42,
  driverFirstName: 'John',
  driverLastName: 'Doe',
  date: '2024-01-15',
  totalDistance: 300,
  idleTime: 1800,
  drivingTime: 18000,
  drivingFuel: 60,
  idleFuel: 3,
  ...overrides,
});

// ---------------------------------------------------------------------------
// filterByDateRange
// ---------------------------------------------------------------------------

describe('filterByDateRange', () => {
  it('keeps records within range', () => {
    const data = [
      { date: '2024-01-01' },
      { date: '2024-06-15' },
      { date: '2024-12-31' },
    ];
    const result = filterByDateRange(data, '2024-01-01', '2024-12-31');
    expect(result).toHaveLength(3);
  });

  it('excludes records outside range', () => {
    const data = [
      { date: '2023-12-31' },
      { date: '2024-01-01' },
      { date: '2025-01-01' },
    ];
    const result = filterByDateRange(data, '2024-01-01', '2024-12-31');
    expect(result).toHaveLength(1);
    expect(result[0].date).toBe('2024-01-01');
  });

  it('returns empty for empty input', () => {
    expect(filterByDateRange([], '2024-01-01', '2024-12-31')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// aggregateUnitMetrics
// ---------------------------------------------------------------------------

describe('aggregateUnitMetrics', () => {
  it('groups records by VIN and sums values', () => {
    const data = [
      makeVehicle({ date: '2024-01-01', totalDistance: 200, totalFuel: 40 }),
      makeVehicle({ date: '2024-01-02', totalDistance: 300, totalFuel: 60 }),
    ];
    const [unit] = aggregateUnitMetrics(data);
    expect(unit.totalMiles).toBe(500);
    expect(unit.avgMpg).toBe('5.00');
  });

  it('calculates idle percentage correctly', () => {
    // idleTime=3600, drivingTime=32400, engine=36000 → idle%=10%
    const [unit] = aggregateUnitMetrics([makeVehicle()]);
    expect(unit.idlePercentage).toBe('10.00');
  });

  it('skips records with null VIN', () => {
    const data = [makeVehicle({ vin: null })];
    expect(aggregateUnitMetrics(data)).toHaveLength(0);
  });

  it('returns zero avgMpg when fuel is zero', () => {
    const [unit] = aggregateUnitMetrics([makeVehicle({ totalFuel: 0 })]);
    expect(unit.avgMpg).toBe('0.00');
  });

  it('converts idle time to minutes', () => {
    // idleTime = 3600 seconds → 60 minutes
    const [unit] = aggregateUnitMetrics([makeVehicle({ idleTime: 3600 })]);
    expect(unit.idleTimeMinutes).toBe(60);
  });
});

// ---------------------------------------------------------------------------
// aggregateDriverMetrics
// ---------------------------------------------------------------------------

describe('aggregateDriverMetrics', () => {
  it('groups records by driverId and sums values', () => {
    const data = [
      makeDriver({ date: '2024-01-01', totalDistance: 100, drivingFuel: 20, idleFuel: 2 }),
      makeDriver({ date: '2024-01-02', totalDistance: 200, drivingFuel: 40, idleFuel: 3 }),
    ];
    const [driver] = aggregateDriverMetrics(data);
    expect(driver.totalMiles).toBe(300);
    expect(driver.avgMpg).toBe('4.62'); // 300 / 65 ≈ 4.62
  });

  it('builds driver name from first + last', () => {
    const [driver] = aggregateDriverMetrics([makeDriver()]);
    expect(driver.driverName).toBe('John Doe');
  });

  it('falls back to Driver ID for nameless records', () => {
    const [driver] = aggregateDriverMetrics([
      makeDriver({ driverFirstName: null, driverLastName: null }),
    ]);
    expect(driver.driverName).toBe('Driver 42');
  });

  it('skips records with null driverId', () => {
    const data = [makeDriver({ driverId: 0 })]; // falsy
    expect(aggregateDriverMetrics(data)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// aggregateFleetKpis
// ---------------------------------------------------------------------------

describe('aggregateFleetKpis', () => {
  it('sums miles and computes mpg across all records', () => {
    const data = [
      makeVehicle({ totalDistance: 1000, totalFuel: 200 }),
      makeVehicle({ vin: '2HTMM2AK0AH654321', totalDistance: 500, totalFuel: 100 }),
    ];
    const kpis = aggregateFleetKpis(data);
    expect(kpis.totalMiles).toBe(1500);
    expect(kpis.avgMpg).toBe('5.00');
  });

  it('returns em dash for mpg when no fuel', () => {
    const kpis = aggregateFleetKpis([makeVehicle({ totalFuel: 0 })]);
    expect(kpis.avgMpg).toBe('—');
  });

  it('calculates idle percentage correctly', () => {
    // idleTime=3600, drivingTime=32400 → 10%
    const kpis = aggregateFleetKpis([makeVehicle()]);
    expect(kpis.idlePct).toBe('10.0');
  });
});

// ---------------------------------------------------------------------------
// buildUnitOptions / buildDriverOptions
// ---------------------------------------------------------------------------

describe('buildUnitOptions', () => {
  it('deduplicates by VIN and sorts alphabetically', () => {
    const data = [
      makeVehicle({ vin: 'ZZZ', vehicleNumber: 'Z-UNIT' }),
      makeVehicle({ vin: 'AAA', vehicleNumber: 'A-UNIT' }),
      makeVehicle({ vin: 'ZZZ', vehicleNumber: 'Z-UNIT' }), // duplicate
    ];
    const opts = buildUnitOptions(data);
    expect(opts).toHaveLength(2);
    expect(opts[0].label).toBe('A-UNIT');
    expect(opts[1].label).toBe('Z-UNIT');
  });

  it('skips records with null VIN', () => {
    expect(buildUnitOptions([makeVehicle({ vin: null })])).toHaveLength(0);
  });
});

describe('buildDriverOptions', () => {
  it('deduplicates by driverId and sorts alphabetically', () => {
    const data = [
      makeDriver({ driverId: 2, driverFirstName: 'Bob', driverLastName: 'Smith' }),
      makeDriver({ driverId: 1, driverFirstName: 'Alice', driverLastName: 'Jones' }),
      makeDriver({ driverId: 2, driverFirstName: 'Bob', driverLastName: 'Smith' }), // duplicate
    ];
    const opts = buildDriverOptions(data);
    expect(opts).toHaveLength(2);
    expect(opts[0].label).toBe('Alice Jones');
    expect(opts[1].label).toBe('Bob Smith');
  });
});
