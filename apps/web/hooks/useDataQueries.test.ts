import { describe, it, expect } from 'vitest';
import { keys } from './useDataQueries';

/**
 * These tests verify that query key factories produce stable, correctly-structured
 * tuples. If any key shape changes unexpectedly, cache invalidation will silently
 * break — catching that here at the unit level prevents hard-to-debug stale data.
 */

describe('keys — query key factories', () => {
  const orgId = 'org_abc123';

  it('orgSettings includes orgId', () => {
    expect(keys.orgSettings(orgId)).toEqual(['org-settings', orgId]);
  });

  it('orgSettings handles undefined orgId', () => {
    expect(keys.orgSettings(undefined)).toEqual(['org-settings', undefined]);
  });

  it('fleetUnits includes orgId', () => {
    expect(keys.fleetUnits(orgId)).toEqual(['fleet-units', orgId]);
  });

  it('vehicleUtilization includes orgId + date params', () => {
    expect(keys.vehicleUtilization(orgId, '2024-01-01', '2024-12-31')).toEqual([
      'vehicle-utilization', orgId, '2024-01-01', '2024-12-31',
    ]);
  });

  it('vehicleUtilization works without date params', () => {
    const k = keys.vehicleUtilization(orgId);
    expect(k[0]).toBe('vehicle-utilization');
    expect(k[1]).toBe(orgId);
  });

  it('driverUtilization includes orgId + date params', () => {
    expect(keys.driverUtilization(orgId, '2024-01-01', '2024-06-30')).toEqual([
      'driver-utilization', orgId, '2024-01-01', '2024-06-30',
    ]);
  });

  it('repairs includes orgId', () => {
    expect(keys.repairs(orgId)).toEqual(['repairs', orgId]);
  });

  it('unitDetail includes orgId and vin', () => {
    const vin = '1HTMM2AK0AH123456';
    expect(keys.unitDetail(orgId, vin)).toEqual(['unit-detail', orgId, vin]);
  });

  it('servicePlan includes orgId', () => {
    expect(keys.servicePlan(orgId)).toEqual(['service-plan', orgId]);
  });

  it('different orgs produce different keys', () => {
    const k1 = keys.vehicleUtilization('org_1');
    const k2 = keys.vehicleUtilization('org_2');
    expect(k1).not.toEqual(k2);
  });

  it('different date ranges produce different keys', () => {
    const k1 = keys.vehicleUtilization(orgId, '2024-01-01', '2024-06-30');
    const k2 = keys.vehicleUtilization(orgId, '2024-07-01', '2024-12-31');
    expect(k1).not.toEqual(k2);
  });
});
