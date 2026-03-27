'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useOrganization } from '@clerk/nextjs';
import Papa from 'papaparse';
import {
  useOrgSettingsQuery,
  useDriverUtilizationQuery,
  useVehicleUtilizationQuery,
  useFleetUnitsQuery,
} from '@/hooks/useDataQueries';
import { computeDriverScore, scoreVariant } from '@/lib/driverScore';
import { Skeleton } from '@/components/Skeleton';
import { EmptyState } from '@/components/EmptyState';

interface DriverRow {
  driverId: number;
  driverName: string;
  totalMiles: number;
  avgMpg: number;
  idlePct: number;
  idleFuelGal: number;
  score: number;
}

function downloadCsv(rows: DriverRow[], orgName: string) {
  const data = rows.map(r => ({
    Driver: r.driverName,
    Miles: Math.round(r.totalMiles),
    MPG: r.avgMpg.toFixed(2),
    'Idle %': r.idlePct.toFixed(2),
    'Idle Fuel (gal)': Math.round(r.idleFuelGal),
    Score: r.score,
  }));
  const csv = Papa.unparse(data);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `driver-scorecard-${orgName.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function DriversPage() {
  const router = useRouter();
  const { organization } = useOrganization();

  const orgSettingsQuery = useOrgSettingsQuery();
  const orgSettings = orgSettingsQuery.data;

  const isMotive = orgSettings?.telematicsProvider === 'MOTIVE';
  const tracksDrivers = orgSettings?.tracksDrivers === true;
  const canShow = isMotive && tracksDrivers;

  const driverUtilQuery = useDriverUtilizationQuery(canShow);
  const fleetUnitsQuery = useFleetUnitsQuery();
  const vehicleUtilQuery = useVehicleUtilizationQuery(
    canShow ? 'MOTIVE' : undefined
  );

  // Compute fleet avg MPG for driver score normalization
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

  // Aggregate driver utilization into per-driver metrics
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
        score,
      };
    }).sort((a, b) => b.score - a.score);
  }, [driverUtilQuery.data, fleetAvgMpg]);

  const isLoading = orgSettingsQuery.isLoading || driverUtilQuery.isLoading;

  if (orgSettingsQuery.isLoading) {
    return (
      <div className="container">
        <Skeleton style={{ height: 300, borderRadius: 8, marginTop: 24 }} />
      </div>
    );
  }

  if (!canShow) {
    return (
      <div className="container" style={{ paddingTop: '2rem' }}>
        <EmptyState
          title="Driver Scorecard Unavailable"
          description={
            !isMotive
              ? 'Driver scoring requires a Motive telematics integration. Samsara does not provide per-driver data.'
              : 'Driver tracking is not enabled for this organization. Enable it in Org Settings.'
          }
        />
      </div>
    );
  }

  return (
    <div className="container" style={{ maxWidth: '1400px' }}>
      <div className="page-header">
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: '700', marginBottom: '0.5rem' }}>
            Driver Scorecard
          </h1>
          <p style={{ color: 'var(--text-secondary)' }}>{organization?.name}</p>
        </div>
        <div className="page-header-controls">
          <button
            className="btn btn-secondary"
            onClick={() => downloadCsv(driverRows, organization?.name || 'fleet')}
            disabled={driverRows.length === 0}
          >
            Export CSV
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="table-container mt-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} style={{ height: 40, borderRadius: 0, marginBottom: 1 }} />
          ))}
        </div>
      ) : driverRows.length === 0 ? (
        <EmptyState
          title="No Driver Data"
          description="No driver utilization records found. Ensure telematics data has been synced."
        />
      ) : (
        <div className="table-container mt-4">
          <table className="table w-full">
            <thead style={{ background: 'var(--primary-dark)', color: 'white', position: 'sticky', top: 0, zIndex: 10 }}>
              <tr>
                <th style={{ color: 'white' }}>Driver</th>
                <th style={{ color: 'white' }}>Miles</th>
                <th style={{ color: 'white' }}>MPG</th>
                <th style={{ color: 'white' }}>Idle %</th>
                <th style={{ color: 'white' }}>Idle Fuel (gal)</th>
                <th style={{ color: 'white' }}>Score</th>
              </tr>
            </thead>
            <tbody>
              {driverRows.map(row => {
                const variant = scoreVariant(row.score);
                const badgeClass =
                  variant === 'success' ? 'bg-green-100 text-green-800 border-green-200' :
                  variant === 'warning' ? 'bg-amber-100 text-amber-800 border-amber-200' :
                  'bg-red-100 text-red-800 border-red-200';
                return (
                  <tr
                    key={row.driverId}
                    className="cursor-pointer hover:bg-bg-hover transition-colors"
                    onClick={() => router.push(`/app/drivers/${row.driverId}`)}
                  >
                    <td className="font-semibold">{row.driverName}</td>
                    <td>{Math.round(row.totalMiles).toLocaleString()}</td>
                    <td>{row.avgMpg.toFixed(2)}</td>
                    <td className="font-semibold">{row.idlePct.toFixed(2)}%</td>
                    <td>{Math.round(row.idleFuelGal).toLocaleString()}</td>
                    <td>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border ${badgeClass}`}>
                        {row.score}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
