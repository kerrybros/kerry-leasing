import { useMemo } from 'react';
import {
  useOrgSettingsQuery,
  useDriverUtilizationQuery,
  useVehicleUtilizationQuery,
  useFleetUnitsQuery,
} from '@/hooks/useDataQueries';
import { computeDriverScore } from '@/lib/driverScore';
import type { DriverRow } from '@/features/drivers/types';

export function useDriversData() {
  const orgSettingsQuery = useOrgSettingsQuery();
  const orgSettings = orgSettingsQuery.data;

  const isMotive = orgSettings?.telematicsProvider === 'MOTIVE';
  const tracksDrivers = orgSettings?.tracksDrivers === true;
  const canShow = isMotive && tracksDrivers;

  const driverUtilQuery = useDriverUtilizationQuery(canShow);
  const fleetUnitsQuery = useFleetUnitsQuery();
  const vehicleUtilQuery = useVehicleUtilizationQuery();

  const fleetAvgMpg = useMemo(() => {
    if (!fleetUnitsQuery.data || !vehicleUtilQuery.data) return undefined;
    const includedVins = new Set(
      fleetUnitsQuery.data.units.filter(u => u.telematicsVin).map(u => u.telematicsVin!)
    );
    const data = vehicleUtilQuery.data.filter(v => v.vin && includedVins.has(v.vin));
    let totalMiles = 0, totalFuel = 0;
    data.forEach(r => {
      totalMiles += r.totalDistance || 0;
      totalFuel += r.totalFuel || 0;
    });
    return totalFuel > 0 ? totalMiles / totalFuel : undefined;
  }, [fleetUnitsQuery.data, vehicleUtilQuery.data]);

  const driverRows = useMemo((): DriverRow[] => {
    if (!driverUtilQuery.data) return [];
    const grouped = new Map<number, {
      driverId: number; driverName: string;
      totalMiles: number; totalFuel: number;
      totalIdleTime: number; totalDrivingTime: number; totalIdleFuel: number;
    }>();
    driverUtilQuery.data.forEach(r => {
      if (!r.driverId) return;
      const existing = grouped.get(r.driverId) || {
        driverId: r.driverId,
        driverName: `${r.driverFirstName || ''} ${r.driverLastName || ''}`.trim() || `Driver ${r.driverId}`,
        totalMiles: 0, totalFuel: 0,
        totalIdleTime: 0, totalDrivingTime: 0, totalIdleFuel: 0,
      };
      existing.totalMiles += r.totalDistance || 0;
      existing.totalFuel += (r.drivingFuel || 0) + (r.idleFuel || 0);
      existing.totalIdleTime += r.idleTime || 0;
      existing.totalDrivingTime += r.drivingTime || 0;
      existing.totalIdleFuel += r.idleFuel || 0;
      grouped.set(r.driverId, existing);
    });
    return Array.from(grouped.values()).map(d => {
      const engineOn = d.totalIdleTime + d.totalDrivingTime;
      const idlePct = engineOn > 0 ? (d.totalIdleTime / engineOn) * 100 : 0;
      const avgMpg = d.totalFuel > 0 && d.totalMiles > 0 ? d.totalMiles / d.totalFuel : 0;
      const score = computeDriverScore({ idlePct, mpg: avgMpg, fleetAvgMpg });
      return {
        driverId: d.driverId,
        driverName: d.driverName,
        totalMiles: d.totalMiles,
        avgMpg,
        idlePct,
        idleFuelGal: d.totalIdleFuel,
        totalFuelGal: d.totalFuel,
        estimatedFuelCost: Math.round(d.totalFuel * 3.50),
        score,
      };
    }).sort((a, b) => b.score - a.score);
  }, [driverUtilQuery.data, fleetAvgMpg]);

  return {
    orgSettingsQuery,
    isMotive,
    tracksDrivers,
    canShow,
    driverRows,
    isLoading: orgSettingsQuery.isLoading || driverUtilQuery.isLoading,
  };
}
