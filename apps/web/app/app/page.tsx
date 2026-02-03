'use client';

import { useAuth, useOrganization } from '@clerk/nextjs';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createApiClient, ApiError } from '@/lib/api';
import { KpiCard } from '@/components/KpiCard';

interface Unit {
  id: string;
  vin: string;
  unitNumber: string;
  make?: string;
  model?: string;
  year?: number;
  status?: string;
}

interface TelematicsSummary {
  totalMiles: number;
  totalIdleMinutes: number;
  avgMpg: number;
  period: string;
}

interface RepairSummary {
  totalRepairs: number;
  totalCost: number;
  period: string;
}

interface FleetData {
  units: Unit[];
  count: number;
  telematicsSummary?: TelematicsSummary;
  repairSummary?: RepairSummary;
}

export default function FleetOverviewPage() {
  const router = useRouter();
  const { getToken } = useAuth();
  const { organization } = useOrganization();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fleetData, setFleetData] = useState<FleetData | null>(null);

  useEffect(() => {
    if (organization) {
      loadFleetData();
    }
  }, [organization]);

  const loadFleetData = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const api = createApiClient(token);
      
      // Load units
      const unitsData = await api.get<{ units: Unit[]; count: number }>('/units');
      
      // Try to load telematics summary for last 30 days
      let telematicsSummary: TelematicsSummary | undefined;
      try {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);
        
        telematicsSummary = await api.get<TelematicsSummary>(
          `/telematics/summary?from=${startDate.toISOString().split('T')[0]}&to=${endDate.toISOString().split('T')[0]}`
        );
      } catch (err) {
        console.log('Telematics data not available');
      }

      setFleetData({
        ...unitsData,
        telematicsSummary,
      });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(`Error: ${err.message}`);
      } else {
        setError('Failed to load fleet data');
      }
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const openUnitDetail = (vin: string) => {
    window.open(`/app/units/${vin}`, '_blank');
  };

  if (!organization) {
    return (
      <div className="container">
        <div className="alert alert-warning">
          <strong>⚠️ No Organization Selected</strong>
          <p>Please select or create an organization to view your fleet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="page-header">
        <h1 className="page-title">Fleet Overview</h1>
        <p className="page-subtitle">
          {organization.name} • {fleetData?.count || 0} units
        </p>
      </div>

      {loading && (
        <div className="alert alert-info">
          <span className="loading">Loading fleet data...</span>
        </div>
      )}

      {error && (
        <div className="alert alert-error">
          <strong>Error:</strong> {error}
        </div>
      )}

      {!loading && fleetData && (
        <>
          {/* KPI Summary */}
          {fleetData.telematicsSummary && (
            <div className="kpi-grid">
              <KpiCard
                label="Total Miles (30d)"
                value={fleetData.telematicsSummary.totalMiles.toLocaleString()}
                variant="primary"
              />
              <KpiCard
                label="Idle Hours (30d)"
                value={Math.round(fleetData.telematicsSummary.totalIdleMinutes / 60).toLocaleString()}
                variant="warning"
              />
              <KpiCard
                label="Avg Fuel Economy"
                value={`${fleetData.telematicsSummary.avgMpg.toFixed(1)} MPG`}
                variant="success"
              />
              <KpiCard
                label="Active Units"
                value={fleetData.count}
                variant="primary"
              />
            </div>
          )}

          {/* Fleet Table */}
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">🚛 Fleet Units</h2>
            </div>

            {fleetData.units.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                No units found for this organization.
              </p>
            ) : (
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Unit #</th>
                      <th>VIN</th>
                      <th>Vehicle</th>
                      <th>Year</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fleetData.units.map((unit) => (
                      <tr key={unit.id}>
                        <td>
                          <span className="font-semibold">{unit.unitNumber}</span>
                        </td>
                        <td>
                          <span className="font-mono">{unit.vin}</span>
                        </td>
                        <td>
                          {unit.make && unit.model
                            ? `${unit.make} ${unit.model}`
                            : unit.make || unit.model || '—'}
                        </td>
                        <td>{unit.year || '—'}</td>
                        <td>
                          <span
                            className={`badge ${
                              unit.status === 'active'
                                ? 'badge-success'
                                : 'badge-gray'
                            }`}
                          >
                            {unit.status || 'active'}
                          </span>
                        </td>
                        <td>
                          <button
                            className="button button-sm"
                            onClick={() => openUnitDetail(unit.vin)}
                          >
                            View Details →
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
