/**
 * Late-arriving Motive data must be picked up by a lookback (verify) pass.
 *
 * Mirrors the observed case for org org_39B7lu1b8YKds8IOtzrk6LpKnLW, driver
 * 5494617, date 2026-07-16:
 *  - the first pull stored 7 idle events for the driver plus 3 more with
 *    driver: null, and Motive assigned the driver to those 3 later;
 *  - a live pull can also return ids that were absent on the earlier pull;
 *  - the driver utilization rollup grew by the new idle minutes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Row = Record<string, any>;

// vi.mock factories are hoisted above imports, so everything they touch must
// be created inside vi.hoisted.
const { idleTable, utilTable, fetchIdleEvents, fetchDriverUtilization } = vi.hoisted(() => {
  function makeTable(keyFields: string[], compositeKey: string) {
    const rows = new Map<string, Row>();
    const keyOf = (r: Row) => keyFields.map((f) => String(r[f])).join('|');
    const whereKey = (where: Row) => keyOf(where[compositeKey]);
    return {
      rows,
      seed(r: Row) {
        rows.set(keyOf(r), { ...r });
      },
      findUnique: vi.fn(async ({ where }: { where: Row }) => rows.get(whereKey(where)) ?? null),
      create: vi.fn(async ({ data }: { data: Row }) => {
        rows.set(keyOf(data), { ...data });
        return data;
      }),
      update: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
        const k = whereKey(where);
        const next = { ...(rows.get(k) ?? {}), ...data };
        rows.set(k, next);
        return next;
      }),
    };
  }
  return {
    idleTable: makeTable(['clerkOrgId', 'motiveEventId'], 'clerkOrgId_motiveEventId'),
    utilTable: makeTable(['clerkOrgId', 'driverId', 'date'], 'clerkOrgId_driverId_date'),
    fetchIdleEvents: vi.fn(),
    fetchDriverUtilization: vi.fn(),
  };
});

vi.mock('../../../src/lib/prisma.js', () => ({
  appPrisma: {
    motiveIdleEvent: idleTable,
    motiveDriverUtilization: utilTable,
  },
}));

vi.mock('../../../src/telematics/motive/endpoints/idleEvents.js', () => ({
  fetchIdleEvents: (...args: unknown[]) => fetchIdleEvents(...args),
}));
vi.mock('../../../src/telematics/motive/endpoints/driverUtilization.js', () => ({
  fetchDriverUtilization: (...args: unknown[]) => fetchDriverUtilization(...args),
}));

import { syncIdleEvents } from '../../../src/telematics/motive/sync/syncIdleEvents.js';
import { syncDriverUtilization } from '../../../src/telematics/motive/sync/syncDriverUtilization.js';

const ORG = 'org_39B7lu1b8YKds8IOtzrk6LpKnLW';
const DRIVER = 5494617;
const DATE = '2026-07-16';
const FIRST_VERIFIED = new Date('2026-07-20T11:02:16.833Z');

const storedIds = [5129355024, 5129460905, 5129560908, 5129798061, 5130050079, 5130833184, 5131522209];
const lateIds = [5131643738, 5131971793, 5132380430];
const lateWindows: Record<number, [string, string]> = {
  5131643738: ['2026-07-16T12:52:00-04:00', '2026-07-16T12:57:00-04:00'],
  5131971793: ['2026-07-16T13:38:00-04:00', '2026-07-16T13:44:00-04:00'],
  5132380430: ['2026-07-16T13:45:00-04:00', '2026-07-16T14:42:00-04:00'],
};

function liveIdleEvent(id: number, start: string, end: string) {
  return {
    id,
    driver: { id: DRIVER, first_name: 'Greg', last_name: 'Gretch' },
    vehicle: { id: 4242, number: '1701' },
    start_time: start,
    end_time: end,
    veh_fuel_start: 100,
    veh_fuel_end: 100.5, // 100.5 - 100 is exact in floating point
    end_type: 'driving',
  };
}

beforeEach(() => {
  idleTable.rows.clear();
  utilTable.rows.clear();
  vi.clearAllMocks();

  // What the first (Jul 17) pull left behind, verified once on Jul 20.
  storedIds.forEach((id, i) => {
    const hour = String(6 + i).padStart(2, '0');
    idleTable.seed({
      clerkOrgId: ORG,
      motiveEventId: BigInt(id),
      driverId: DRIVER,
      driverFirstName: 'Greg',
      driverLastName: 'Gretch',
      driverUsername: null,
      driverEmail: null,
      vehicleId: 4242,
      vehicleNumber: '1701',
      vin: null,
      startTime: `${DATE}T${hour}:00:00-04:00`,
      endTime: `${DATE}T${hour}:10:00-04:00`,
      date: DATE,
      vehFuelStart: 100,
      vehFuelEnd: 100.5,
      idleFuel: 0.5,
      endType: 'driving',
      lastVerifiedAt: FIRST_VERIFIED,
      dataVersion: 1,
    });
  });
  utilTable.seed({
    clerkOrgId: ORG,
    driverId: DRIVER,
    date: DATE,
    utilization: 30.5,
    idleTime: 8816,
    drivingTime: 3879,
    idleFuel: 2.1,
    drivingFuel: 9.9,
    lastVerifiedAt: FIRST_VERIFIED,
    dataVersion: 1,
  });
});

describe('syncIdleEvents on a lookback pass', () => {
  it('inserts ids that were absent on the earlier pull and re-verifies the rest', async () => {
    const live = [
      ...storedIds.map((id, i) => {
        const hour = String(6 + i).padStart(2, '0');
        return liveIdleEvent(id, `${DATE}T${hour}:00:00-04:00`, `${DATE}T${hour}:10:00-04:00`);
      }),
      ...lateIds.map((id) => liveIdleEvent(id, ...lateWindows[id])),
    ];
    fetchIdleEvents.mockResolvedValueOnce(live);

    const result = await syncIdleEvents(ORG, 'test-key', DATE, true);

    expect(fetchIdleEvents).toHaveBeenCalledTimes(1);
    expect(fetchIdleEvents.mock.calls[0][1]).toBe(DATE);

    expect(result.recordCount).toBe(10);
    expect(result.newCount).toBe(3);
    expect(result.unchangedCount).toBe(7);
    expect(result.updatedCount).toBe(0);
    expect(result.errorCount).toBe(0);

    // The three late ids now exist, attributed to the driver and the day.
    for (const id of lateIds) {
      const row = idleTable.rows.get(`${ORG}|${id}`);
      expect(row, `late id ${id} should be inserted`).toBeTruthy();
      expect(row!.driverId).toBe(DRIVER);
      expect(row!.date).toBe(DATE);
      expect(row!.startTime).toBe(lateWindows[id][0]);
      expect(row!.endTime).toBe(lateWindows[id][1]);
      expect(row!.dataVersion).toBe(1);
      expect(row!.lastVerifiedAt).toBeInstanceOf(Date);
      expect(row!.lastVerifiedAt.getTime()).toBeGreaterThan(FIRST_VERIFIED.getTime());
    }

    // The seven already-stored ids were untouched except for lastVerifiedAt.
    for (const id of storedIds) {
      const row = idleTable.rows.get(`${ORG}|${id}`)!;
      expect(row.dataVersion).toBe(1);
      expect(row.lastVerifiedAt.getTime()).toBeGreaterThan(FIRST_VERIFIED.getTime());
    }
    expect(idleTable.rows.size).toBe(10);
  });

  it('writes a driver that Motive assigned after the first pull (the Jul 16 case)', async () => {
    // The three events already exist, but driverless: the first pull stored
    // them with driver: null and the verify pass on Jul 20 left them alone.
    for (const id of lateIds) {
      idleTable.seed({
        clerkOrgId: ORG,
        motiveEventId: BigInt(id),
        driverId: null,
        driverFirstName: null,
        driverLastName: null,
        driverUsername: null,
        driverEmail: null,
        vehicleId: 4242,
        vehicleNumber: '1701',
        vin: null,
        startTime: lateWindows[id][0],
        endTime: lateWindows[id][1],
        date: DATE,
        vehFuelStart: 100,
        vehFuelEnd: 100.5,
        idleFuel: 0.5,
        endType: 'driving',
        lastVerifiedAt: FIRST_VERIFIED,
        dataVersion: 1,
      });
    }
    fetchIdleEvents.mockResolvedValueOnce([
      ...storedIds.map((id, i) => {
        const hour = String(6 + i).padStart(2, '0');
        return liveIdleEvent(id, `${DATE}T${hour}:00:00-04:00`, `${DATE}T${hour}:10:00-04:00`);
      }),
      ...lateIds.map((id) => liveIdleEvent(id, ...lateWindows[id])),
    ]);

    const result = await syncIdleEvents(ORG, 'test-key', DATE, true);

    expect(result.recordCount).toBe(10);
    expect(result.newCount).toBe(0);
    expect(result.updatedCount).toBe(3);
    expect(result.unchangedCount).toBe(7);

    for (const id of lateIds) {
      const row = idleTable.rows.get(`${ORG}|${id}`)!;
      expect(row.driverId).toBe(DRIVER);
      expect(row.driverFirstName).toBe('Greg');
      expect(row.driverLastName).toBe('Gretch');
      expect(row.dataVersion).toBe(2);
      expect(row.lastVerifiedAt.getTime()).toBeGreaterThan(FIRST_VERIFIED.getTime());
    }
    // A query by driver and day now finds all ten events.
    const byDriver = [...idleTable.rows.values()].filter((r) => r.driverId === DRIVER && r.date === DATE);
    expect(byDriver).toHaveLength(10);
  });

  it('inserts late ids even on a non-verify pass (backdate outside the window)', async () => {
    fetchIdleEvents.mockResolvedValueOnce([
      ...storedIds.map((id, i) => {
        const hour = String(6 + i).padStart(2, '0');
        return liveIdleEvent(id, `${DATE}T${hour}:00:00-04:00`, `${DATE}T${hour}:10:00-04:00`);
      }),
      ...lateIds.map((id) => liveIdleEvent(id, ...lateWindows[id])),
    ]);

    const result = await syncIdleEvents(ORG, 'test-key', DATE, false);

    expect(result.newCount).toBe(3);
    expect(idleTable.rows.size).toBe(10);
    // Non-verify passes do not claim to have verified anything.
    expect(idleTable.rows.get(`${ORG}|${storedIds[0]}`)!.lastVerifiedAt).toEqual(FIRST_VERIFIED);
  });
});

describe('syncDriverUtilization on a lookback pass', () => {
  it('re-pulls the rollup and updates it when Motive finalized more idle time', async () => {
    // 68 more idle minutes (the three late events) landed in the rollup.
    fetchDriverUtilization.mockResolvedValueOnce([
      {
        driver: { id: DRIVER, first_name: 'Greg', last_name: 'Gretch' },
        utilization: 27.1,
        idle_time: 8816 + 68 * 60,
        driving_time: 3879,
        idle_fuel: 2.9,
        driving_fuel: 9.9,
      },
    ]);

    const result = await syncDriverUtilization(ORG, 'test-key', DATE, true);

    expect(fetchDriverUtilization).toHaveBeenCalledTimes(1);
    expect(fetchDriverUtilization.mock.calls[0][1]).toBe(DATE);
    expect(result.updatedCount).toBe(1);
    expect(result.newCount).toBe(0);
    expect(result.unchangedCount).toBe(0);

    const row = utilTable.rows.get(`${ORG}|${DRIVER}|${DATE}`)!;
    expect(row.idleTime).toBe(8816 + 68 * 60);
    expect(row.dataVersion).toBe(2);
    expect(row.lastVerifiedAt.getTime()).toBeGreaterThan(FIRST_VERIFIED.getTime());
  });

  it('only bumps lastVerifiedAt when the rollup did not change', async () => {
    fetchDriverUtilization.mockResolvedValueOnce([
      {
        driver: { id: DRIVER },
        utilization: 30.5,
        idle_time: 8816,
        driving_time: 3879,
        idle_fuel: 2.1,
        driving_fuel: 9.9,
      },
    ]);

    const result = await syncDriverUtilization(ORG, 'test-key', DATE, true);

    expect(result.unchangedCount).toBe(1);
    const row = utilTable.rows.get(`${ORG}|${DRIVER}|${DATE}`)!;
    expect(row.dataVersion).toBe(1);
    expect(row.lastVerifiedAt.getTime()).toBeGreaterThan(FIRST_VERIFIED.getTime());
  });
});
