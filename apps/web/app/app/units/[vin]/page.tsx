'use client';

import { useAuth, useOrganization } from '@clerk/nextjs';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createApiClient, ApiError } from '@/lib/api';
import { KpiCard } from '@/components/KpiCard';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface Repair {
  id: string;
  invoiceNumber: string;
  repairOrderNumber: string;
  status: string;
  total: number;
  date: string; // ISO string
}

interface UnitInfo {
  vin: string;
  unitNumber: string;
  make: string | null;
  model: string | null;
  year: number | null;
  customerId: string;
  customerName: string | null;
}

interface VehicleUtilization {
  vehicleId: number;
  vehicleNumber: string | null;
  vin: string | null;
  date: string;
  utilizationPercentage: number | null;
  totalDistance: number | null;
  idleTime: number | null;
  totalFuel: number | null;
  idleFuel: number | null;
}

interface MonthlyMetrics {
  month: string;
  monthKey: string;
  totalMiles: number;
  avgMpg: number;
  idlePercentage: number;
  idleFuel: number;
  idleTimeMinutes: number;
}

export default function UnitDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { getToken } = useAuth();
  const { organization } = useOrganization();
  const vin = params.vin as string;

  const [activeTab, setActiveTab] = useState<'overview' | 'repairs' | 'telematics'>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unit, setUnit] = useState<UnitInfo | null>(null);
  const [repairs, setRepairs] = useState<Repair[]>([]);
  const [telematicsData, setTelematicsData] = useState<VehicleUtilization[]>([]);

  const loadUnitData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      
      const headers: Record<string, string> = {};
      if (organization?.id) {
        headers['x-organization-id'] = organization.id;
      }
      
      const api = createApiClient(token, headers);

      // Load unit data from fleet endpoint (includes repair + telematics)
      const unitData = await api.get<{
        servicePlan: {
          id: string;
          repairUnitNumber: string | null;
          matchType: string;
          repairVin: string | null;
          telematicsVin: string | null;
          lastSyncedAt: string | null;
        };
        unitInfo: {
          unitId: string;
          unitNumber: string | null;
          vin: string | null;
          make: string | null;
          model: string | null;
          year: number | null;
          licensePlate: string | null;
          customerId: string;
        } | null;
        telematics: {
          history: VehicleUtilization[];
          hasData: boolean;
        };
        repairs: {
          history: Array<{
            revenue_detail_id: string;
            invoice_date: string;
            invoice_number: string | null;
            repair_order: string | null;
            line_code: string | null;
            parts_description: string | null;
            labor_description: string | null;
            line_amt: number | null;
            tax_amt: number | null;
            customer: string | null;
          }>;
          hasData: boolean;
        };
      }>(`/fleet/units/${vin}`);

      // Set unit info (prioritize repair data, fallback to telematics)
      const unitInfo: UnitInfo = {
        vin: vin,
        unitNumber: unitData.unitInfo?.unitNumber || unitData.servicePlan.repairUnitNumber || vin.slice(-6),
        make: unitData.unitInfo?.make || null,
        model: unitData.unitInfo?.model || null,
        year: unitData.unitInfo?.year || null,
        customerId: unitData.unitInfo?.customerId || organization?.id || '',
        customerName: organization?.name || null,
      };
      
      setUnit(unitInfo);

      // Set telematics data
      setTelematicsData(unitData.telematics.history);

      // Transform repair data to match expected Repair interface
      const transformedRepairs: Repair[] = unitData.repairs.history.map(r => ({
        id: r.revenue_detail_id,
        invoiceNumber: r.invoice_number || 'N/A',
        repairOrderNumber: r.repair_order || 'N/A',
        status: 'Completed', // Revenue details are completed repairs
        total: (r.line_amt || 0) + (r.tax_amt || 0),
        date: r.invoice_date,
      }));

      setRepairs(transformedRepairs);
      
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
  }, [getToken, organization?.id, vin]);

  useEffect(() => {
    if (organization) {
      loadUnitData();
    }
  }, [loadUnitData, organization]);

  // --- Aggregation Logic (Similar to Fleet Page) ---

  // 1. Overview Summary (Last 30 Days)
  const overviewSummary = useMemo(() => {
    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);
    const cutOffDate = thirtyDaysAgo.toISOString().split('T')[0];

    const recentData = telematicsData.filter(d => d.date >= cutOffDate);

    const totalMiles = recentData.reduce((sum, d) => sum + (d.totalDistance || 0), 0);
    const totalIdleTime = recentData.reduce((sum, d) => sum + (d.idleTime || 0), 0);
    const totalFuel = recentData.reduce((sum, d) => sum + (d.totalFuel || 0), 0);
    const totalDays = recentData.length;

    // Weighted AVG MPG
    const avgMpg = totalFuel > 0 ? totalMiles / totalFuel : 0;
    
    // Idle Hours
    const idleHours = totalIdleTime / 3600;

    return {
      totalMiles,
      avgMpg,
      idleHours,
      totalDays
    };
  }, [telematicsData]);

  // 2. Monthly Metrics for Telematics Tab
  const monthlyMetrics = useMemo((): MonthlyMetrics[] => {
    const monthlyMap = new Map<string, {
      totalMiles: number;
      totalIdleTime: number;
      totalFuel: number;
      totalIdleFuel: number;
      days: number;
    }>();

    // Use all loaded data (usually sorted desc, maybe needs sorting)
    telematicsData.forEach(record => {
      const monthKey = record.date.substring(0, 7); // YYYY-MM
      
      const existing = monthlyMap.get(monthKey) || {
        totalMiles: 0,
        totalIdleTime: 0,
        totalFuel: 0,
        totalIdleFuel: 0,
        days: 0,
      };

      existing.totalMiles += record.totalDistance || 0;
      existing.totalIdleTime += record.idleTime || 0;
      existing.totalFuel += record.totalFuel || 0;
      existing.totalIdleFuel += record.idleFuel || 0;
      existing.days += 1;

      monthlyMap.set(monthKey, existing);
    });

    return Array.from(monthlyMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([monthKey, data]) => {
        const [year, month] = monthKey.split('-');
        const monthName = new Date(parseInt(year), parseInt(month) - 1).toLocaleString('default', { month: 'long' });
        
        return {
          month: monthName,
          monthKey,
          totalMiles: Math.round(data.totalMiles),
          avgMpg: data.totalFuel > 0 ? parseFloat((data.totalMiles / data.totalFuel).toFixed(2)) : 0,
          idlePercentage: data.totalIdleTime > 0 ? parseFloat(((data.totalIdleTime / (data.days * 86400)) * 100).toFixed(2)) : 0,
          idleFuel: Math.round(data.totalIdleFuel),
          idleTimeMinutes: Math.round(data.totalIdleTime / 60),
        };
      });
  }, [telematicsData]);

  // Calculate totals for Monthly Table footer
  const totals = useMemo(() => {
    return monthlyMetrics.reduce((acc, m) => ({
      totalMiles: acc.totalMiles + m.totalMiles,
      totalIdleFuel: acc.totalIdleFuel + m.idleFuel,
      totalIdleTime: acc.totalIdleTime + m.idleTimeMinutes,
      totalFuel: acc.totalFuel + (m.totalMiles / (m.avgMpg || 1)),
    }), { totalMiles: 0, totalIdleFuel: 0, totalIdleTime: 0, totalFuel: 0 });
  }, [monthlyMetrics]);

  const overallAvgMpg = totals.totalFuel > 0 ? (totals.totalMiles / totals.totalFuel).toFixed(2) : '0.00';
  const overallIdlePercentage = telematicsData.length > 0
    ? ((totals.totalIdleTime * 60) / (telematicsData.length * 86400) * 100).toFixed(2)
    : '0.00';

  // Chart Styles
  const chartStyles = {
    bar: {
      background: 'var(--primary-dark)',
      fontSize: '1.25rem',
      fontWeight: '700',
      color: '#fff',
      padding: '0.5rem 1rem',
      borderRadius: '4px 4px 0 0',
      marginBottom: '0',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      textTransform: 'uppercase' as const,
      letterSpacing: '0.05em',
    },
    container: {
      background: 'var(--bg-card)',
      borderRadius: '0 0 4px 4px',
      padding: '1rem',
      border: '1px solid var(--border)',
      borderTop: 'none',
      height: '300px',
    }
  };

  const tableHeaderStyle = {
    background: 'var(--primary-dark)',
    color: 'white',
    position: 'sticky' as const,
    top: 0,
    zIndex: 10,
  };

  if (loading) {
    return (
      <div className="container">
        <div className="loading">Loading unit data...</div>
      </div>
    );
  }

  if (error || !unit) {
    return (
      <div className="container">
        <button 
          onClick={() => router.back()}
          className="btn btn-secondary mb-4"
        >
          ← Back to Fleet
        </button>
        <div className="error">{error || 'Unit not found'}</div>
      </div>
    );
  }

  return (
    <div className="container">
      <div style={{ marginBottom: '2rem' }}>
        <button 
          onClick={() => router.back()}
          className="btn btn-secondary mb-4"
          style={{ fontSize: '0.875rem' }}
        >
          ← Back to Fleet
        </button>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: '2rem', fontWeight: '700', marginBottom: '0.5rem' }}>
              Unit {unit.unitNumber}
            </h1>
            <div style={{ display: 'flex', gap: '1rem', color: 'var(--text-secondary)' }}>
              <span className="font-mono">{unit.vin}</span>
              <span>•</span>
              <span>{unit.year} {unit.make} {unit.model}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="tabs">
        <button
          className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          className={`tab ${activeTab === 'repairs' ? 'active' : ''}`}
          onClick={() => setActiveTab('repairs')}
        >
          Repairs
        </button>
        <button
          className={`tab ${activeTab === 'telematics' ? 'active' : ''}`}
          onClick={() => setActiveTab('telematics')}
        >
          Telematics
        </button>
      </div>

      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {/* Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem' }}>
            <KpiCard
              label="Total Miles (30d)"
              value={telematicsData.length > 0 ? `${Math.round(overviewSummary.totalMiles).toLocaleString()} mi` : '—'}
            />
            <KpiCard
              label="Avg MPG (30d)"
              value={telematicsData.length > 0 ? overviewSummary.avgMpg.toFixed(2) : '—'}
            />
            <KpiCard
              label="Idle Hours (30d)"
              value={telematicsData.length > 0 ? `${Math.round(overviewSummary.idleHours)} hrs` : '—'}
            />
          </div>

          {/* Recent Repairs Table */}
          <div className="card">
            <h3 style={{ fontSize: '1.25rem', marginBottom: '1rem', fontWeight: '600' }}>Recent Repairs</h3>
            <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
              <table className="table">
                <thead>
                  <tr style={{ background: 'var(--bg-tertiary)', borderBottom: '2px solid var(--border)' }}>
                    <th>Date</th>
                    <th>RO #</th>
                    <th>Invoice #</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {repairs.slice(0, 5).map((repair) => (
                    <tr key={repair.id}>
                      <td>{new Date(repair.date).toLocaleDateString()}</td>
                      <td>{repair.repairOrderNumber}</td>
                      <td>{repair.invoiceNumber}</td>
                      <td><span className="badge badge-gray">{repair.status}</span></td>
                    </tr>
                  ))}
                  {repairs.length === 0 && (
                    <tr><td colSpan={4} style={{ textAlign: 'center', padding: '1rem' }}>No recent repairs</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'repairs' && (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr style={{ background: 'var(--primary-dark)', color: 'white' }}>
                <th style={{ color: 'white' }}>Date</th>
                <th style={{ color: 'white' }}>Repair Order #</th>
                <th style={{ color: 'white' }}>Invoice #</th>
                <th style={{ color: 'white' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {repairs.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                    No repair history found
                  </td>
                </tr>
              ) : (
                repairs.map((repair) => (
                  <tr key={repair.id}>
                    <td>{new Date(repair.date).toLocaleDateString()}</td>
                    <td>{repair.repairOrderNumber}</td>
                    <td>{repair.invoiceNumber}</td>
                    <td>
                      <span className="badge badge-gray">{repair.status}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'telematics' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
          {/* LEFT COLUMN - CHARTS */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            
            {/* MPG Chart */}
            <div>
              <div style={chartStyles.bar}>MPG</div>
              <div style={chartStyles.container}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={monthlyMetrics}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis 
                      dataKey="month" 
                      stroke="var(--text-secondary)" 
                      fontSize={12} 
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis 
                      stroke="var(--text-secondary)" 
                      fontSize={12} 
                      tickLine={false}
                      axisLine={false}
                      domain={['auto', 'auto']}
                    />
                    <Tooltip 
                      contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '4px' }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="avgMpg" 
                      stroke="#f59e0b" 
                      strokeWidth={4} 
                      dot={{ fill: '#f59e0b', r: 6, strokeWidth: 0 }} 
                      activeDot={{ r: 8 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Idle % Chart */}
            <div>
              <div style={chartStyles.bar}>Idle %</div>
              <div style={chartStyles.container}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={monthlyMetrics}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis 
                      dataKey="month" 
                      stroke="var(--text-secondary)" 
                      fontSize={12} 
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis 
                      stroke="var(--text-secondary)" 
                      fontSize={12} 
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip 
                      contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '4px' }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="idlePercentage" 
                      stroke="#f59e0b" 
                      strokeWidth={4} 
                      dot={{ fill: '#f59e0b', r: 6, strokeWidth: 0 }}
                      activeDot={{ r: 8 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Miles Driven Chart */}
            <div>
              <div style={chartStyles.bar}>Miles Driven</div>
              <div style={chartStyles.container}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={monthlyMetrics}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis 
                      dataKey="month" 
                      stroke="var(--text-secondary)" 
                      fontSize={12} 
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis 
                      stroke="var(--text-secondary)" 
                      fontSize={12} 
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip 
                      contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '4px' }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="totalMiles" 
                      stroke="#f59e0b" 
                      strokeWidth={4} 
                      dot={{ fill: '#f59e0b', r: 6, strokeWidth: 0 }}
                      activeDot={{ r: 8 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

          </div>

          {/* RIGHT COLUMN - TABLES */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            
            {/* Monthly Summary Table */}
            <div>
              <div style={chartStyles.bar}>Monthly Summary</div>
              <div className="table-container" style={{ 
                borderTopLeftRadius: 0,
                borderTopRightRadius: 0,
                borderTop: 'none'
              }}>
                <table className="table">
                  <thead style={tableHeaderStyle}>
                    <tr>
                      <th style={{ color: 'white' }}>Month</th>
                      <th style={{ color: 'white' }}>MPG</th>
                      <th style={{ color: 'white' }}>Miles</th>
                      <th style={{ color: 'white' }}>Idle %</th>
                      <th style={{ color: 'white' }}>Idle Fuel</th>
                      <th style={{ color: 'white' }}>Idle Time (mins)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyMetrics.map((month) => (
                      <tr key={month.monthKey}>
                        <td style={{ fontWeight: '600' }}>{month.month}</td>
                        <td>{month.avgMpg.toFixed(2)}</td>
                        <td>{month.totalMiles.toLocaleString()}</td>
                        <td style={{ fontWeight: '600' }}>{month.idlePercentage.toFixed(2)}%</td>
                        <td>{month.idleFuel.toLocaleString()}</td>
                        <td>{month.idleTimeMinutes.toLocaleString()}</td>
                      </tr>
                    ))}
                    {/* Monthly Table Totals */}
                    <tr style={{ background: 'var(--primary-dark)', color: 'white', fontWeight: '700' }}>
                      <td style={{ color: 'white' }}>Total</td>
                      <td style={{ color: 'white' }}>{overallAvgMpg}</td>
                      <td style={{ color: 'white' }}>{totals.totalMiles.toLocaleString()}</td>
                      <td style={{ color: 'white' }}>{overallIdlePercentage}%</td>
                      <td style={{ color: 'white' }}>{totals.totalIdleFuel.toLocaleString()}</td>
                      <td style={{ color: 'white' }}>{totals.totalIdleTime.toLocaleString()}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
