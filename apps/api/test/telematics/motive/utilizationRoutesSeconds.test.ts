import { describe, it, expect, vi, beforeEach } from 'vitest';

// motive_vehicle_utilization stores minutes. These routes must hand the web
// seconds, the same as the Samsara branches, or idle hours read 60x too low.

const motiveVehicleUtilization = { findMany: vi.fn() };
const motiveDriverUtilization = { findMany: vi.fn() };
const motiveDrivingPeriod = { findMany: vi.fn() };
const servicePlanUnit = { findMany: vi.fn() };
const telematicsProviderAccount = { findUnique: vi.fn() };
const appPrisma = {
  motiveVehicleUtilization,
  motiveDriverUtilization,
  motiveDrivingPeriod,
  servicePlanUnit,
  telematicsProviderAccount,
};

const pass = (_req: any, _res: any, next: any) => next();
vi.mock('../../../src/middleware/auth.js', () => ({
  clerkAuthMiddleware: pass,
  requireOrg: pass,
  requireRole: () => pass,
}));
vi.mock('../../../src/middleware/providerValidation.js', () => ({
  requireProvider: () => pass,
}));
vi.mock('../../../src/lib/prisma.js', () => ({
  getAppPrisma: () => appPrisma,
  getRepairPrisma: () => ({}),
}));
vi.mock('../../../src/lib/redis.js', () => ({
  getRedis: () => null,
  cacheGetOrSet: async (_k: string, _ttl: number, fn: () => unknown) => fn(),
}));

const { default: telematicsRouter } = await import('../../../src/routes/telematics.js');
const { default: fleetRouter } = await import('../../../src/routes/fleet.js');

/** Runs the GET handler chain registered for `path` and returns the JSON body. */
async function get(router: any, path: string, query: Record<string, string> = {}) {
  const layer = router.stack.find((l: any) => l.route?.path === path && l.route.methods.get);
  if (!layer) throw new Error(`no GET ${path}`);
  const handlers = layer.route.stack.map((s: any) => s.handle);
  const req: any = { auth: { orgId: 'org_test' }, query, params: {}, headers: {} };
  let body: any;
  let status = 200;
  const res: any = {
    setHeader: () => res,
    status: (s: number) => { status = s; return res; },
    json: (b: any) => { body = b; return res; },
  };
  for (const h of handlers) {
    let advanced = false;
    await h(req, res, () => { advanced = true; });
    if (!advanced) break;
  }
  return { status, body };
}

// 90 idle minutes and 8 driving hours, as syncVehicleUtilization stores them.
const motiveRow = {
  vehicleId: 1,
  vehicleNumber: '2241',
  vin: 'VIN1',
  date: '2026-10-01',
  utilizationPercentage: 84,
  totalDistance: 400,
  idleTime: 90,
  drivingTime: 480,
  totalFuel: 60,
  idleFuel: 2,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /telematics/motive/vehicle-utilization', () => {
  it('returns idle and driving time in seconds, leaving distance and fuel alone', async () => {
    motiveVehicleUtilization.findMany.mockResolvedValue([motiveRow]);
    const { status, body } = await get(telematicsRouter, '/motive/vehicle-utilization', {
      page: '1',
      pageSize: '50',
    });
    expect(status).toBe(200);
    const [row] = body.data;
    expect(row.idleTime).toBe(5400);
    expect(row.drivingTime).toBe(28800);
    expect(row.idleTime / 3600).toBe(1.5);
    expect(row.totalDistance).toBe(400);
    expect(row.totalFuel).toBe(60);
    // Idle % and MPG are ratios, so the unit change must not move them.
    expect(row.idleTime / (row.idleTime + row.drivingTime)).toBeCloseTo(90 / 570);
    expect(row.totalDistance / row.totalFuel).toBeCloseTo(400 / 60);
  });
});

describe('GET /telematics/motive/driver-utilization', () => {
  it('passes stored driver seconds through unchanged (they are already seconds)', async () => {
    motiveDriverUtilization.findMany.mockResolvedValue([
      { driverId: 7, date: '2026-10-01', idleTime: 5400, drivingTime: 28800 },
    ]);
    motiveDrivingPeriod.findMany.mockResolvedValue([]);
    const { body } = await get(telematicsRouter, '/motive/driver-utilization');
    expect(body[0].idleTime).toBe(5400);
    expect(body[0].drivingTime).toBe(28800);
  });
});

describe('GET /fleet/units', () => {
  it('returns Motive idleTime in seconds, like the Samsara branch', async () => {
    servicePlanUnit.findMany.mockResolvedValue([
      { id: 'u1', telematicsVin: 'VIN1', isTelematicsOnly: true, repairUnitId: null },
    ]);
    telematicsProviderAccount.findUnique.mockResolvedValue({ provider: 'MOTIVE' });
    motiveVehicleUtilization.findMany.mockResolvedValue([motiveRow]);
    const { status, body } = await get(fleetRouter, '/units');
    expect(status).toBe(200);
    const t = body.units[0].telematics;
    expect(t.idleTime).toBe(5400);
    expect(t.drivingTime).toBe(28800);
    expect(t.totalFuel).toBe(60);
  });
});
