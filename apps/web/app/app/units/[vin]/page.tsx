'use client';

import { useAuth } from '@clerk/nextjs';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createApiClient, ApiError } from '@/lib/api';
import { StatCard } from '@/components/StatCard';
import { KpiCard } from '@/components/KpiCard';

interface Repair {
  id: string;
  invoiceNumber?: string;
  description?: string;
  date: string;
  total?: number;
  status?: string;
}

interface UnitInfo {
  vin: string;
  unitNumber: string;
  make?: string;
  model?: string;
  year?: number;
}

interface TelematicsDaily {
  date: string;
  milesDriven: number;
  idleMinutes: number;
  fuelGallons?: number;
  avgMpg?: number;
  engineHours?: number;
}

interface TelematicsData {
  metrics: TelematicsDaily[];
  summary: {
    totalMiles: number;
    totalIdleHours: number;
    avgMpg: number;
    totalFuel: number;
  };
}

export default function UnitDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { getToken } = useAuth();
  const vin = params.vin as string;

  const [activeTab, setActiveTab] = useState<'overview' | 'repairs' | 'telematics'>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unit, setUnit] = useState<UnitInfo | null>(null);
  const [repairs, setRepairs] = useState<Repair[]>([]);
  const [telematics, setTelematics] = useState<TelematicsData | null>(null);

  useEffect(() => {
    loadUnitData();
  }, [vin]);

  const loadUnitData = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const api = createApiClient(token);

      // Load repairs
      const repairData = await api.get<{
        repairs: Repair[];
        unit: UnitInfo;
      }>(`/units/${vin}/repairs`);

      setUnit(repairData.unit);
      setRepairs(repairData.repairs);

      // Try to load telematics for last 30 days
      try {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);

        const telematicsData = await api.get<TelematicsDaily[]>(
          `/telematics/daily?vin=${vin}&from=${startDate.toISOString().split('T')[0]}&to=${endDate.toISOString().split('T')[0]}`
        );

        // Calculate summary
        const summary = {
          totalMiles: telematicsData.reduce((sum, d) => sum + (d.milesDriven || 0), 0),
          totalIdleHours: telematicsData.reduce((sum, d) => sum + (d.idleMinutes || 0), 0) / 60,
          avgMpg: telematicsData.reduce((sum, d) => sum + (d.avgMpg || 0), 0) / (telematicsData.length || 1),
          totalFuel: telematicsData.reduce((sum, d) => sum + (d.fuelGallons || 0), 0),
        };

        setTelematics({
          metrics: telematicsData,
          summary,
        });
      } catch (err) {
        console.log('Telematics data not available for this unit');
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(`Error: ${err.message}`);
      } else {
        setError('Failed to load unit data');
      }
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const totalRepairCost = repairs.reduce((sum, r) => sum + (r.total || 0), 0);

  return (
    <div className="container">
      {/* Header */}
      <div style={{ marginBottom: 'var(--spacing-lg)' }}>
        <button
          className="button button-secondary button-sm"
          onClick={() => router.push('/app')}
        >
          ← Back to Fleet
        </button>
      </div>

      <div className="page-header">
        <h1 className="page-title">
          {unit ? `Unit ${unit.unitNumber}` : 'Unit Details'}
        </h1>
        {unit && (
          <p className="page-subtitle">
            {unit.year && `${unit.year} `}
            {unit.make && unit.model && `${unit.make} ${unit.model}`}
            {' • '}
            <span className="font-mono">{unit.vin}</span>
          </p>
        )}
      </div>

      {loading && (
        <div className="alert alert-info">
          <span className="loading">Loading unit data...</span>
        </div>
      )}

      {error && (
        <div className="alert alert-error">
          <strong>Error:</strong> {error}
        </div>
      )}

      {!loading && unit && (
        <>
          {/* Overview Stats */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 'var(--spacing-lg)',
            marginBottom: 'var(--spacing-xl)',
          }}>
            <StatCard
              icon="🔧"
              label="Total Repairs"
              value={repairs.length}
              subtext="All time"
            />
            <StatCard
              icon="💰"
              label="Repair Costs"
              value={`$${totalRepairCost.toLocaleString()}`}
              subtext="All time"
            />
            {telematics && (
              <>
                <StatCard
                  icon="🛣️"
                  label="Miles Driven"
                  value={telematics.summary.totalMiles.toLocaleString()}
                  subtext="Last 30 days"
                />
                <StatCard
                  icon="⏱️"
                  label="Idle Hours"
                  value={Math.round(telematics.summary.totalIdleHours)}
                  subtext="Last 30 days"
                />
              </>
            )}
          </div>

          {/* Tabs */}
          <div style={{
            borderBottom: '2px solid var(--color-gray-200)',
            marginBottom: 'var(--spacing-xl)',
          }}>
            <div style={{
              display: 'flex',
              gap: 'var(--spacing-md)',
            }}>
              {['overview', 'repairs', 'telematics'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab as any)}
                  style={{
                    padding: 'var(--spacing-md) var(--spacing-lg)',
                    background: 'none',
                    border: 'none',
                    borderBottom: activeTab === tab ? '3px solid var(--color-primary-600)' : '3px solid transparent',
                    color: activeTab === tab ? 'var(--color-primary-600)' : 'var(--text-secondary)',
                    fontWeight: activeTab === tab ? 600 : 400,
                    cursor: 'pointer',
                    transition: 'all var(--transition-fast)',
                    textTransform: 'capitalize',
                    fontSize: '1rem',
                  }}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          {/* Tab Content */}
          {activeTab === 'overview' && (
            <div className="card">
              <h2 className="card-title">📊 Quick Summary</h2>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                gap: 'var(--spacing-lg)',
                marginTop: 'var(--spacing-lg)',
              }}>
                <div>
                  <h3 style={{ fontSize: '1rem', marginBottom: 'var(--spacing-md)', color: 'var(--text-secondary)' }}>
                    Recent Repairs
                  </h3>
                  {repairs.slice(0, 5).map((repair) => (
                    <div
                      key={repair.id}
                      style={{
                        padding: 'var(--spacing-sm)',
                        borderBottom: '1px solid var(--color-gray-200)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                        <span style={{ fontSize: '0.875rem' }}>
                          {new Date(repair.date).toLocaleDateString()}
                        </span>
                        <span style={{ fontWeight: 600 }}>
                          ${repair.total?.toFixed(2) || '0.00'}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                        {repair.description || repair.invoiceNumber || 'N/A'}
                      </div>
                    </div>
                  ))}
                  {repairs.length === 0 && (
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                      No repair history
                    </p>
                  )}
                </div>

                {telematics && (
                  <div>
                    <h3 style={{ fontSize: '1rem', marginBottom: 'var(--spacing-md)', color: 'var(--text-secondary)' }}>
                      Telematics (30d)
                    </h3>
                    <div className="kpi-grid" style={{ gridTemplateColumns: '1fr' }}>
                      <KpiCard
                        label="Avg MPG"
                        value={telematics.summary.avgMpg.toFixed(1)}
                        variant="success"
                      />
                      <KpiCard
                        label="Total Fuel"
                        value={`${telematics.summary.totalFuel.toFixed(0)} gal`}
                        variant="primary"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'repairs' && (
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">🔧 Repair History</h2>
                <span style={{ color: 'var(--text-secondary)' }}>
                  {repairs.length} total repairs
                </span>
              </div>

              {repairs.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                  No repair history found for this unit.
                </p>
              ) : (
                <div className="table-container">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Invoice #</th>
                        <th>Description</th>
                        <th className="text-right">Total</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {repairs.map((repair) => (
                        <tr key={repair.id}>
                          <td>{new Date(repair.date).toLocaleDateString()}</td>
                          <td>
                            <span className="font-mono">{repair.invoiceNumber || 'N/A'}</span>
                          </td>
                          <td>{repair.description || '—'}</td>
                          <td className="text-right font-semibold">
                            {repair.total ? `$${repair.total.toFixed(2)}` : '—'}
                          </td>
                          <td>
                            <span
                              className={`badge ${
                                repair.status === 'completed'
                                  ? 'badge-success'
                                  : 'badge-primary'
                              }`}
                            >
                              {repair.status || 'pending'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'telematics' && (
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">📡 Telematics Data</h2>
                <span style={{ color: 'var(--text-secondary)' }}>
                  Last 30 days
                </span>
              </div>

              {!telematics ? (
                <div className="alert alert-warning">
                  <strong>⚠️ No Telematics Data</strong>
                  <p>Telematics data is not available for this unit.</p>
                </div>
              ) : (
                <>
                  {/* Summary KPIs */}
                  <div className="kpi-grid" style={{ marginBottom: 'var(--spacing-xl)' }}>
                    <KpiCard
                      label="Total Miles"
                      value={telematics.summary.totalMiles.toLocaleString()}
                      variant="primary"
                    />
                    <KpiCard
                      label="Idle Hours"
                      value={Math.round(telematics.summary.totalIdleHours)}
                      variant="warning"
                    />
                    <KpiCard
                      label="Avg MPG"
                      value={telematics.summary.avgMpg.toFixed(1)}
                      variant="success"
                    />
                    <KpiCard
                      label="Total Fuel"
                      value={`${telematics.summary.totalFuel.toFixed(0)} gal`}
                      variant="primary"
                    />
                  </div>

                  {/* Daily Metrics Table */}
                  <div className="table-container">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th className="text-right">Miles</th>
                          <th className="text-right">Idle (min)</th>
                          <th className="text-right">Fuel (gal)</th>
                          <th className="text-right">MPG</th>
                          <th className="text-right">Engine Hours</th>
                        </tr>
                      </thead>
                      <tbody>
                        {telematics.metrics
                          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                          .map((metric) => (
                            <tr key={metric.date}>
                              <td>{new Date(metric.date).toLocaleDateString()}</td>
                              <td className="text-right font-semibold">
                                {metric.milesDriven?.toFixed(1) || '0.0'}
                              </td>
                              <td className="text-right">
                                {metric.idleMinutes?.toFixed(0) || '0'}
                              </td>
                              <td className="text-right">
                                {metric.fuelGallons?.toFixed(1) || '—'}
                              </td>
                              <td className="text-right">
                                {metric.avgMpg?.toFixed(1) || '—'}
                              </td>
                              <td className="text-right">
                                {metric.engineHours?.toFixed(1) || '—'}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
