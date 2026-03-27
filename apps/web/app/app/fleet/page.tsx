'use client';

import { useOrganization } from '@clerk/nextjs';
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  useOrgSettingsQuery,
  useFleetUnitsQuery,
  useVehicleUtilizationQuery,
  useDriverUtilizationQuery,
  useRepairsQuery,
  type VehicleUtilization,
  type DriverUtilization,
} from '@/hooks/useDataQueries';
import { DateRangePicker } from '@/components/DateRangePicker';
import { MultiSelect } from '@/components/MultiSelect';
import { Skeleton } from '@/components/Skeleton';
import { KpiCard } from '@/components/KpiCard';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
} from 'recharts';
import { RepairBreakdown, isDamageInvoice, type RepairUnitSummary } from './RepairBreakdown';

// Styles
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
    padding: '0.5rem',
    border: '1px solid var(--border)',
    borderTop: 'none',
    height: '220px',
    minHeight: '220px',
  }
};

const tableHeaderStyle = {
  background: 'var(--primary-dark)',
  color: 'white',
  position: 'sticky' as const,
  top: 0,
  zIndex: 10,
};

const defaultOrgSettings = {
  tracksDrivers: true,
  telematicsProvider: null as 'MOTIVE' | 'SAMSARA' | null,
  contractStartDate: null as string | null,
};

// Helper to format long date (e.g. "January 1st 2026")
const formatLongDate = (dateStr: string) => {
  const d = new Date(dateStr);
  const month = d.toLocaleString('default', { month: 'long' });
  const day = d.getDate();
  const year = d.getFullYear();
  const suffix = (n: number) => {
    if (n > 3 && n < 21) return 'th';
    switch (n % 10) {
      case 1: return 'st';
      case 2: return 'nd';
      case 3: return 'rd';
      default: return 'th';
    }
  };
  return `${month} ${day}${suffix(day)} ${year}`;
};

// Helper to get month name
const getMonthName = (monthIndex: number) => {
  return new Date(2000, monthIndex, 1).toLocaleString('default', { month: 'long' });
};

interface MonthlyMetrics {
  month: string;
  monthKey: string;
  totalMiles: number;
  avgMpg: number;
  idlePercentage: number;
  idleFuel: number;
  idleTimeMinutes: number;
}

interface UnitMetrics {
  vin: string;
  unitNumber: string;
  totalMiles: number;
  avgMpg: string;
  idlePercentage: string;
  idleFuel: number;
  idleTimeMinutes: number;
}

interface DriverMetrics {
  driverId: number;
  driverName: string;
  totalMiles: number;
  avgMpg: string;
  idlePercentage: string;
  idleFuel: number;
  idleTimeMinutes: number;
}

export default function FleetOverviewPage() {
  const router = useRouter();
  const { organization, isLoaded: orgLoaded } = useOrganization();

  const [activeTab, setActiveTab] = useState<'telematics' | 'repairs'>('telematics');
  const [viewMode, setViewMode] = useState<'unit' | 'driver'>('unit');
  const [selectedId, setSelectedId] = useState<string | number | null>(null);

  // Telematics View State
  const [telematicsView, setTelematicsView] = useState<'trends' | 'breakdown'>('trends');
  const [telematicsSelectedUnits, setTelematicsSelectedUnits] = useState<string[]>([]);
  const [telematicsSelectedDrivers, setTelematicsSelectedDrivers] = useState<string[]>([]);

  // Repair filters
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
  const [selectedYears, setSelectedYears] = useState<string[]>([]);
  const [selectedUnits, setSelectedUnits] = useState<string[]>([]);
  void selectedMonths; void selectedYears; void selectedUnits;

  const [repairEndDate, setRepairEndDate] = useState(() =>
    new Date().toISOString().split('T')[0]
  );
  const [repairStartDate, setRepairStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 12);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() =>
    new Date().toISOString().split('T')[0]
  );
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 12);
    return d.toISOString().split('T')[0];
  });

  const [selectedTableYear, setSelectedTableYear] = useState<number>(new Date().getFullYear());
  const [orgErrorDismissed, setOrgErrorDismissed] = useState(false);

  // --- TanStack Query Hooks ---
  const orgSettingsQuery = useOrgSettingsQuery();
  const fleetUnitsQuery = useFleetUnitsQuery();
  const orgSettings = orgSettingsQuery.data ?? defaultOrgSettings;

  const vehicleUtilQuery = useVehicleUtilizationQuery(orgSettings.telematicsProvider);

  const canLoadDrivers =
    orgSettings.tracksDrivers && orgSettings.telematicsProvider === 'MOTIVE';
  const driverUtilQuery = useDriverUtilizationQuery(canLoadDrivers);

  const repairsQuery = useRepairsQuery();

  // Derived loading/error state (compatible with existing logic below)
  const telematicsLoading =
    !orgLoaded ||
    orgSettingsQuery.isLoading ||
    fleetUnitsQuery.isLoading ||
    vehicleUtilQuery.isLoading;

  const telematicsError =
    (fleetUnitsQuery.error as Error | null)?.message ||
    (vehicleUtilQuery.error as Error | null)?.message ||
    null;

  const repairsLoading = repairsQuery.isLoading;
  const repairsError = (repairsQuery.error as Error | null)?.message || null;

  const orgSettingsError =
    !orgErrorDismissed
      ? (orgSettingsQuery.error as Error | null)?.message ?? null
      : null;

  // Apply contractStartDate from org settings / repairs to date pickers
  useEffect(() => {
    if (orgSettingsQuery.data?.contractStartDate) {
      setStartDate(orgSettingsQuery.data.contractStartDate);
    }
  }, [orgSettingsQuery.data?.contractStartDate]);

  useEffect(() => {
    if (repairsQuery.data?.customer?.contractStartDate) {
      setRepairStartDate(repairsQuery.data.customer.contractStartDate);
    }
  }, [repairsQuery.data?.customer?.contractStartDate]);

  // If org stops tracking drivers, revert to unit view
  useEffect(() => {
    if (orgSettingsQuery.data && !orgSettingsQuery.data.tracksDrivers && viewMode === 'driver') {
      setViewMode('unit');
    }
  }, [orgSettingsQuery.data, viewMode]);

  // --- Build raw data arrays (filtered by includedVins for telematics) ---
  const vehicleData = useMemo((): VehicleUtilization[] => {
    if (!fleetUnitsQuery.data || !vehicleUtilQuery.data) return [];
    const includedVins = new Set(
      fleetUnitsQuery.data.units
        .filter(u => u.telematicsVin)
        .map(u => u.telematicsVin!)
    );
    return vehicleUtilQuery.data.filter(v => v.vin && includedVins.has(v.vin));
  }, [fleetUnitsQuery.data, vehicleUtilQuery.data]);

  const driverData = useMemo<DriverUtilization[]>(() => driverUtilQuery.data ?? [], [driverUtilQuery.data]);
  const repairUnits = useMemo<RepairUnitSummary[]>(() => repairsQuery.data?.units ?? [], [repairsQuery.data]);

  // Reset selected table year when date range changes
  useEffect(() => {
    const startYear = new Date(startDate).getFullYear();
    const endYear = new Date(endDate).getFullYear();
    if (selectedTableYear < startYear || selectedTableYear > endYear) {
      setSelectedTableYear(endYear);
    }
  }, [startDate, endDate, selectedTableYear]);

  // Reset selection when switching view modes
  useEffect(() => {
    setSelectedId(null);
  }, [viewMode]);

  // 1. Date Filtering
  const dateFilteredVehicleData = useMemo(() =>
    vehicleData.filter(r => r.date >= startDate && r.date <= endDate),
    [vehicleData, startDate, endDate]
  );

  const dateFilteredDriverData = useMemo(() =>
    driverData.filter(r => r.date >= startDate && r.date <= endDate),
    [driverData, startDate, endDate]
  );

  // 2. Options Generation
  const unitOptions = useMemo(() => {
    const unique = new Set<string>();
    const opts: { label: string; value: string }[] = [];
    dateFilteredVehicleData.forEach(v => {
      if (v.vin && !unique.has(v.vin)) {
        unique.add(v.vin);
        opts.push({ label: v.vehicleNumber || v.vin.slice(-6), value: v.vin });
      }
    });
    return opts.sort((a, b) => a.label.localeCompare(b.label));
  }, [dateFilteredVehicleData]);

  const driverOptions = useMemo(() => {
    const unique = new Set<number>();
    const opts: { label: string; value: string }[] = [];
    dateFilteredDriverData.forEach(d => {
      if (d.driverId && !unique.has(d.driverId)) {
        unique.add(d.driverId);
        const name = `${d.driverFirstName || ''} ${d.driverLastName || ''}`.trim() || `Driver ${d.driverId}`;
        opts.push({ label: name, value: d.driverId.toString() });
      }
    });
    return opts.sort((a, b) => a.label.localeCompare(b.label));
  }, [dateFilteredDriverData]);

  // 3. Selection Filtering
  const filteredVehicleData = useMemo(() => {
    if (telematicsSelectedUnits.length === 0) return dateFilteredVehicleData;
    return dateFilteredVehicleData.filter(r => r.vin && telematicsSelectedUnits.includes(r.vin));
  }, [dateFilteredVehicleData, telematicsSelectedUnits]);

  const filteredDriverData = useMemo(() => {
    if (telematicsSelectedDrivers.length === 0) return dateFilteredDriverData;
    return dateFilteredDriverData.filter(r => r.driverId && telematicsSelectedDrivers.includes(r.driverId.toString()));
  }, [dateFilteredDriverData, telematicsSelectedDrivers]);

  // --- Aggregation Logic ---

  const unitMetrics = useMemo((): UnitMetrics[] => {
    const grouped = new Map<string, {
      vin: string; unitNumber: string; totalMiles: number;
      totalIdleTime: number; totalDrivingTime: number;
      totalFuel: number; totalIdleFuel: number; days: number;
    }>();
    filteredVehicleData.forEach(record => {
      if (!record.vin) return;
      const existing = grouped.get(record.vin) || {
        vin: record.vin, unitNumber: record.vehicleNumber || record.vin.slice(-6),
        totalMiles: 0, totalIdleTime: 0, totalDrivingTime: 0,
        totalFuel: 0, totalIdleFuel: 0, days: 0,
      };
      existing.totalMiles += record.totalDistance || 0;
      existing.totalIdleTime += record.idleTime || 0;
      existing.totalDrivingTime += record.drivingTime || 0;
      existing.totalFuel += record.totalFuel || 0;
      existing.totalIdleFuel += record.idleFuel || 0;
      existing.days += 1;
      grouped.set(record.vin, existing);
    });
    return Array.from(grouped.values()).map(unit => {
      const engineOnTime = unit.totalIdleTime + unit.totalDrivingTime;
      const idlePct = engineOnTime > 0 ? (unit.totalIdleTime / engineOnTime) * 100 : 0;
      return {
        vin: unit.vin, unitNumber: unit.unitNumber,
        totalMiles: unit.totalMiles,
        avgMpg: unit.totalFuel > 0 ? (unit.totalMiles / unit.totalFuel).toFixed(2) : '0.00',
        idlePercentage: idlePct.toFixed(2),
        idleFuel: Math.round(unit.totalIdleFuel),
        idleTimeMinutes: Math.round(unit.totalIdleTime / 60),
      };
    });
  }, [filteredVehicleData]);

  const driverMetrics = useMemo((): DriverMetrics[] => {
    const grouped = new Map<number, {
      driverId: number; driverName: string; totalMiles: number;
      totalIdleTime: number; totalDrivingTime: number;
      totalFuel: number; totalIdleFuel: number; days: number;
    }>();
    filteredDriverData.forEach(record => {
      if (!record.driverId) return;
      const existing = grouped.get(record.driverId) || {
        driverId: record.driverId,
        driverName: `${record.driverFirstName || ''} ${record.driverLastName || ''}`.trim() || `Driver ${record.driverId}`,
        totalMiles: 0, totalIdleTime: 0, totalDrivingTime: 0,
        totalFuel: 0, totalIdleFuel: 0, days: 0,
      };
      const fuel = (record.drivingFuel || 0) + (record.idleFuel || 0);
      existing.totalIdleTime += record.idleTime || 0;
      existing.totalDrivingTime += record.drivingTime || 0;
      existing.totalFuel += fuel;
      existing.totalIdleFuel += record.idleFuel || 0;
      existing.totalMiles += record.totalDistance || 0;
      existing.days += 1;
      grouped.set(record.driverId, existing);
    });
    return Array.from(grouped.values()).map(driver => {
      const engineOnTime = driver.totalIdleTime + driver.totalDrivingTime;
      const idlePct = engineOnTime > 0 ? (driver.totalIdleTime / engineOnTime) * 100 : 0;
      return {
        driverId: driver.driverId, driverName: driver.driverName,
        totalMiles: driver.totalMiles,
        avgMpg: driver.totalFuel > 0 && driver.totalMiles > 0
          ? (driver.totalMiles / driver.totalFuel).toFixed(2) : '0.00',
        idlePercentage: idlePct.toFixed(2),
        idleFuel: Math.round(driver.totalIdleFuel),
        idleTimeMinutes: Math.round(driver.totalIdleTime / 60),
      };
    });
  }, [filteredDriverData]);

  const monthlyMetrics = useMemo(() => {
    const monthlyMap = new Map<string, {
      totalMiles: number; totalIdleTime: number; totalDrivingTime: number;
      totalFuel: number; totalIdleFuel: number; days: number;
    }>();
    let sourceData: (VehicleUtilization | DriverUtilization)[] = [];
    if (viewMode === 'unit') {
      sourceData = filteredVehicleData;
      if (selectedId) sourceData = (sourceData as VehicleUtilization[]).filter(r => r.vin === selectedId);
    } else {
      sourceData = filteredDriverData;
      if (selectedId) sourceData = (sourceData as DriverUtilization[]).filter(r => r.driverId === selectedId);
    }
    sourceData.forEach(record => {
      const monthKey = record.date.substring(0, 7);
      const existing = monthlyMap.get(monthKey) || {
        totalMiles: 0, totalIdleTime: 0, totalDrivingTime: 0,
        totalFuel: 0, totalIdleFuel: 0, days: 0,
      };
      const miles = record.totalDistance || 0;
      const idleTime = record.idleTime || 0;
      const idleFuel = record.idleFuel || 0;
      const drivingTime = (record as VehicleUtilization).drivingTime || 0;
      let fuel = 0;
      if (viewMode === 'unit') {
        fuel = (record as VehicleUtilization).totalFuel || 0;
      } else {
        fuel = ((record as DriverUtilization).drivingFuel || 0) + ((record as DriverUtilization).idleFuel || 0);
      }
      existing.totalMiles += miles;
      existing.totalIdleTime += idleTime;
      existing.totalDrivingTime += drivingTime;
      existing.totalFuel += fuel;
      existing.totalIdleFuel += idleFuel;
      existing.days += 1;
      monthlyMap.set(monthKey, existing);
    });
    const idlePctFromData = (data: { totalIdleTime: number; totalDrivingTime: number }) => {
      const engineOn = data.totalIdleTime + data.totalDrivingTime;
      return engineOn > 0 ? (data.totalIdleTime / engineOn) * 100 : 0;
    };
    const chartData = Array.from(monthlyMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([monthKey, data]) => {
        const [year, month] = monthKey.split('-');
        const date = new Date(parseInt(year), parseInt(month) - 1);
        const monthName = date.toLocaleString('default', { month: 'short' });
        const startYear = new Date(startDate).getFullYear();
        const endYear = new Date(endDate).getFullYear();
        const label = startYear !== endYear ? `${monthName} '${year.slice(2)}` : monthName;
        return {
          month: label, monthKey,
          totalMiles: Math.round(data.totalMiles),
          avgMpg: data.totalFuel > 0 ? parseFloat((data.totalMiles / data.totalFuel).toFixed(2)) : 0,
          idlePercentage: parseFloat(idlePctFromData(data).toFixed(2)),
          idleFuel: Math.round(data.totalIdleFuel),
          idleTimeMinutes: Math.round(data.totalIdleTime / 60),
        };
      });
    const tableData = Array.from({ length: 12 }, (_, i) => {
      const monthNum = i + 1;
      const monthKey = `${selectedTableYear}-${String(monthNum).padStart(2, '0')}`;
      const data = monthlyMap.get(monthKey);
      if (data) {
        return {
          month: getMonthName(i), monthKey,
          totalMiles: Math.round(data.totalMiles),
          avgMpg: data.totalFuel > 0 ? parseFloat((data.totalMiles / data.totalFuel).toFixed(2)) : 0,
          idlePercentage: parseFloat(idlePctFromData(data).toFixed(2)),
          idleFuel: Math.round(data.totalIdleFuel),
          idleTimeMinutes: Math.round(data.totalIdleTime / 60),
        };
      }
      return { month: getMonthName(i), monthKey, totalMiles: 0, avgMpg: 0, idlePercentage: 0, idleFuel: 0, idleTimeMinutes: 0 };
    });
    return { chartData, tableData };
  }, [filteredVehicleData, filteredDriverData, viewMode, selectedId, selectedTableYear, startDate, endDate]);

  const fleetTotals = useMemo(() => {
    const data = viewMode === 'unit' ? filteredVehicleData : filteredDriverData;
    let totalMiles = 0, totalFuel = 0, totalIdleTime = 0, totalDrivingTime = 0, totalIdleFuel = 0;
    data.forEach(r => {
      if (r.date.startsWith(String(selectedTableYear))) {
        totalMiles += r.totalDistance || 0;
        totalIdleTime += r.idleTime || 0;
        totalDrivingTime += viewMode === 'unit'
          ? (r as VehicleUtilization).drivingTime || 0
          : (r as DriverUtilization).drivingTime || 0;
        totalIdleFuel += r.idleFuel || 0;
        if (viewMode === 'unit') totalFuel += (r as VehicleUtilization).totalFuel || 0;
        else totalFuel += ((r as DriverUtilization).drivingFuel || 0) + ((r as DriverUtilization).idleFuel || 0);
      }
    });
    const engineOnTime = totalIdleTime + totalDrivingTime;
    const idlePct = engineOnTime > 0 ? (totalIdleTime / engineOnTime) * 100 : 0;
    return {
      totalMiles, totalIdleFuel,
      totalIdleTime: Math.round(totalIdleTime / 60),
      avgMpg: totalFuel > 0 ? (totalMiles / totalFuel).toFixed(2) : '0.00',
      idlePercentage: idlePct.toFixed(2),
    };
  }, [filteredVehicleData, filteredDriverData, viewMode, selectedTableYear]);

  // Fleet-wide KPI bar (full date range, no unit/driver filter, no year filter)
  const fleetKpis = useMemo(() => {
    let totalMiles = 0, totalFuel = 0, totalIdleTime = 0, totalDrivingTime = 0, totalIdleFuel = 0;
    dateFilteredVehicleData.forEach(r => {
      totalMiles += r.totalDistance || 0;
      totalFuel += r.totalFuel || 0;
      totalIdleTime += r.idleTime || 0;
      totalDrivingTime += r.drivingTime || 0;
      totalIdleFuel += r.idleFuel || 0;
    });
    const engineOnTime = totalIdleTime + totalDrivingTime;
    const idlePct = engineOnTime > 0 ? (totalIdleTime / engineOnTime) * 100 : 0;
    return {
      totalMiles: Math.round(totalMiles),
      avgMpg: totalFuel > 0 ? (totalMiles / totalFuel).toFixed(2) : '—',
      idlePct: idlePct.toFixed(1),
      idleFuel: Math.round(totalIdleFuel),
    };
  }, [dateFilteredVehicleData]);

  // Repair KPIs for KPI bar
  const repairKpis = useMemo(() => {
    const start = repairStartDate;
    const end = repairEndDate;
    let totalJobs = 0;
    let damageJobs = 0;
    repairUnits.forEach(u => {
      const filteredInvoices = u.invoices.filter(
        inv => inv.invoiceDate >= start && inv.invoiceDate <= end
      );
      const jobs = new Set<string>();
      const damageJobIds = new Set<string>();
      filteredInvoices.forEach(inv => {
        const jobId = inv.orderNumber || inv.invoiceNumber;
        jobs.add(jobId);
        if (isDamageInvoice(inv)) damageJobIds.add(jobId);
      });
      totalJobs += jobs.size;
      damageJobs += damageJobIds.size;
    });
    return { totalJobs, damageJobs };
  }, [repairUnits, repairStartDate, repairEndDate]);

  // Top/Bottom performers
  const topIdleUnits = useMemo(() =>
    [...unitMetrics]
      .sort((a, b) => parseFloat(b.idlePercentage) - parseFloat(a.idlePercentage))
      .slice(0, 5),
    [unitMetrics]
  );

  const topMpgUnits = useMemo(() =>
    [...unitMetrics]
      .sort((a, b) => parseFloat(b.avgMpg) - parseFloat(a.avgMpg))
      .slice(0, 5),
    [unitMetrics]
  );

  // Year toggle
  const showYearToggle = useMemo(() => {
    const startYear = new Date(startDate).getFullYear();
    const endYear = new Date(endDate).getFullYear();
    return endYear > startYear;
  }, [startDate, endDate]);

  const availableYears = useMemo(() => {
    const startYear = new Date(startDate).getFullYear();
    const endYear = new Date(endDate).getFullYear();
    const years: number[] = [];
    for (let y = startYear; y <= endYear; y++) years.push(y);
    return years;
  }, [startDate, endDate]);

  const handleRowClick = (id: string | number) => {
    setSelectedId(selectedId === id ? null : id);
  };

  const navigateToDetails = (e: React.MouseEvent, id: string | number) => {
    e.stopPropagation();
    if (viewMode === 'unit') {
      router.push(`/app/units/${id}`);
    }
  };

  return (
    <div className="container" style={{ maxWidth: '1800px' }}>
      <div className="page-header relative">
        <div className="flex flex-col gap-2">
          <div>
            <h1 style={{ fontSize: '2rem', fontWeight: '700', marginBottom: '0.5rem' }}>
              Fleet Overview
            </h1>
            <p style={{ color: 'var(--text-secondary)' }}>{organization?.name}</p>
          </div>
          {(activeTab === 'repairs' || activeTab === 'telematics') && (
            <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-bg-card px-6 py-2 rounded-lg border border-border shadow-sm text-center min-w-[400px]">
              <div className="text-xs text-text-secondary uppercase tracking-wider font-semibold mb-1">
                {activeTab === 'repairs' ? 'Showing Repairs For' : 'Showing Telematics For'}
              </div>
              <div className="text-xl font-bold text-text-primary">
                {activeTab === 'repairs'
                  ? `${formatLongDate(repairStartDate)} - ${formatLongDate(repairEndDate)}`
                  : `${formatLongDate(startDate)} - ${formatLongDate(endDate)}`}
              </div>
            </div>
          )}
        </div>
        <div className="page-header-controls" style={{ display: 'flex', gap: '1rem', alignItems: 'center', justifyContent: 'flex-end', flex: 1, flexWrap: 'wrap' }}>
          <DateRangePicker
            startDate={activeTab === 'telematics' ? startDate : repairStartDate}
            endDate={activeTab === 'telematics' ? endDate : repairEndDate}
            onStartDateChange={activeTab === 'telematics' ? setStartDate : setRepairStartDate}
            onEndDateChange={activeTab === 'telematics' ? setEndDate : setRepairEndDate}
          />
        </div>
      </div>

      {orgSettingsError && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-800 dark:text-amber-200 text-sm flex items-center justify-between gap-4">
          <span>Settings could not be loaded: {orgSettingsError} Showing default options.</span>
          <button
            type="button"
            onClick={() => setOrgErrorDismissed(true)}
            className="shrink-0 px-2 py-1 rounded hover:bg-amber-500/20 transition-colors"
            aria-label="Dismiss"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* KPI Bar */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <KpiCard
          label="Total Fleet Miles"
          value={telematicsLoading ? '—' : fleetKpis.totalMiles.toLocaleString()}
          subtext="miles"
        />
        <KpiCard
          label="Fleet Avg MPG"
          value={telematicsLoading ? '—' : fleetKpis.avgMpg}
        />
        <KpiCard
          label="Idle %"
          value={telematicsLoading ? '—' : `${fleetKpis.idlePct}%`}
          variant={!telematicsLoading && parseFloat(fleetKpis.idlePct) > 30 ? 'warning' : 'default'}
        />
        <KpiCard
          label="Idle Fuel"
          value={telematicsLoading ? '—' : fleetKpis.idleFuel.toLocaleString()}
          subtext="gallons"
        />
        <KpiCard
          label="Total Repair Jobs"
          value={repairsLoading ? '—' : repairKpis.totalJobs}
        />
        <KpiCard
          label="Jobs with Damage"
          value={repairsLoading ? '—' : repairKpis.damageJobs}
          variant={!repairsLoading && repairKpis.damageJobs > 0 ? 'warning' : 'default'}
        />
      </div>

      <div className="tabs flex justify-between items-end">
        <div className="flex gap-2">
          <button className={`tab ${activeTab === 'telematics' ? 'active' : ''}`} onClick={() => setActiveTab('telematics')}>
            Telematics
          </button>
          <button className={`tab ${activeTab === 'repairs' ? 'active' : ''}`} onClick={() => setActiveTab('repairs')}>
            Repair Data
          </button>
        </div>
        {activeTab === 'telematics' && (
          <div className="flex items-center gap-4 mb-2">
            {orgSettings.tracksDrivers && (
              <div className="toggle">
                <button className={`toggle-btn ${viewMode === 'unit' ? 'active' : ''}`} onClick={() => setViewMode('unit')}>Unit</button>
                <button className={`toggle-btn ${viewMode === 'driver' ? 'active' : ''}`} onClick={() => setViewMode('driver')}>Driver</button>
              </div>
            )}
            <div className="toggle">
              <button className={`toggle-btn ${telematicsView === 'trends' ? 'active' : ''}`} onClick={() => setTelematicsView('trends')}>Monthly Trends</button>
              <button className={`toggle-btn ${telematicsView === 'breakdown' ? 'active' : ''}`} onClick={() => setTelematicsView('breakdown')}>
                {viewMode === 'unit' ? 'Unit Breakdown' : 'Driver Breakdown'}
              </button>
            </div>
          </div>
        )}
      </div>

      {activeTab === 'repairs' ? (
        <RepairBreakdown
          units={repairUnits}
          loading={repairsLoading}
          error={repairsError}
          startDate={repairStartDate}
          endDate={repairEndDate}
        />
      ) : telematicsView === 'trends' ? (
        <div className="grid lg:grid-cols-12 gap-6">
          {/* LEFT COLUMN - CHARTS */}
          <div className="lg:col-span-8 flex flex-col gap-4">
            <div className="relative flex items-center z-20" style={{ marginBottom: '-0.5rem', color: 'var(--text-secondary)', fontStyle: 'italic', height: '1.5rem', fontSize: '0.875rem' }}>
              {selectedId ? (
                <>
                  <span>
                    {`Showing data for ${viewMode === 'unit' ? 'Unit' : 'Driver'}: ${
                      viewMode === 'unit'
                        ? unitMetrics.find(u => u.vin === selectedId)?.unitNumber || selectedId
                        : driverMetrics.find(d => d.driverId === selectedId)?.driverName || selectedId
                    }`}
                  </span>
                  <button onClick={() => setSelectedId(null)} style={{ marginLeft: '1rem', color: 'var(--primary)', border: 'none', background: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                    Clear Selection
                  </button>
                </>
              ) : (viewMode === 'unit' && telematicsSelectedUnits.length > 0) || (viewMode === 'driver' && telematicsSelectedDrivers.length > 0) ? (
                (() => {
                  const options = viewMode === 'unit' ? unitOptions : driverOptions;
                  const selected = viewMode === 'unit' ? telematicsSelectedUnits : telematicsSelectedDrivers;
                  const labels = options.filter(o => selected.includes(o.value)).map(o => o.label);
                  const clearFilters = () => {
                    if (viewMode === 'unit') setTelematicsSelectedUnits([]);
                    else setTelematicsSelectedDrivers([]);
                  };
                  if (labels.length > 5) {
                    return (
                      <div className="flex items-center">
                        <div className="group relative cursor-pointer flex items-center gap-1">
                          <span className="hover:text-text-primary transition-colors">
                            Showing: {labels.slice(0, 5).join(', ')}... (+{labels.length - 5} others)
                          </span>
                          <svg className="w-4 h-4 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                          <div className="absolute left-0 top-full mt-2 w-[600px] p-0 bg-bg-card border border-border rounded-lg shadow-xl hidden group-hover:block z-50">
                            <div className="sticky top-0 bg-bg-tertiary px-3 py-2 border-b border-border flex justify-between items-center rounded-t-lg">
                              <span className="text-xs font-bold uppercase tracking-wider text-text-secondary">Selected {viewMode === 'unit' ? 'Units' : 'Drivers'} ({labels.length})</span>
                            </div>
                            <div className="p-3 max-h-[400px] overflow-y-auto">
                              <div className="flex flex-wrap gap-2">
                                {labels.map((label, i) => (
                                  <div key={i} className="px-2 py-1 bg-bg-secondary rounded text-sm border border-border text-text-primary font-normal not-italic">{label}</div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                        <button onClick={clearFilters} style={{ marginLeft: '1rem', color: 'var(--primary)', border: 'none', background: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Clear Selection</button>
                      </div>
                    );
                  }
                  return (
                    <div className="flex items-center">
                      <span>Showing: {labels.join(', ')}</span>
                      <button onClick={clearFilters} style={{ marginLeft: '1rem', color: 'var(--primary)', border: 'none', background: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Clear Selection</button>
                    </div>
                  );
                })()
              ) : (
                <span>{`Showing fleet-wide ${viewMode} averages`}</span>
              )}
            </div>

            {/* MPG Chart */}
            <div>
              <div style={chartStyles.bar}>MPG</div>
              <div style={chartStyles.container}>
                {telematicsLoading ? <Skeleton style={{ height: '100%', borderRadius: 8 }} /> : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={monthlyMetrics.chartData} margin={{ top: 20, right: 30, left: 30, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="month" stroke="var(--text-secondary)" fontSize={12} tickLine={false} axisLine={false} padding={{ left: 20, right: 20 }} />
                      <YAxis stroke="var(--text-secondary)" fontSize={12} tickLine={false} axisLine={false} domain={['auto', 'auto']} width={40} />
                      <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '4px' }} />
                      <Line type="monotone" dataKey="avgMpg" stroke="#d9a528" strokeWidth={5} dot={{ fill: '#d9a528', r: 6, strokeWidth: 0 }} activeDot={{ r: 8 }}>
                        <LabelList dataKey="avgMpg" position="top" offset={12} style={{ fill: 'var(--text-secondary)', fontSize: '12px', fontWeight: 700 }} />
                      </Line>
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Idle % Chart */}
            <div>
              <div style={chartStyles.bar}>Idle %</div>
              <div style={chartStyles.container}>
                {telematicsLoading ? <Skeleton style={{ height: '100%', borderRadius: 8 }} /> : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={monthlyMetrics.chartData} margin={{ top: 20, right: 30, left: 30, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="month" stroke="var(--text-secondary)" fontSize={12} tickLine={false} axisLine={false} padding={{ left: 20, right: 20 }} />
                      <YAxis stroke="var(--text-secondary)" fontSize={12} tickLine={false} axisLine={false} width={40} />
                      <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '4px' }} />
                      <Line type="monotone" dataKey="idlePercentage" stroke="#d9a528" strokeWidth={5} dot={{ fill: '#d9a528', r: 6, strokeWidth: 0 }} activeDot={{ r: 8 }}>
                        <LabelList dataKey="idlePercentage" position="top" offset={12} formatter={(val: any) => `${val}%`} style={{ fill: 'var(--text-secondary)', fontSize: '12px', fontWeight: 700 }} />
                      </Line>
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Miles Driven Chart */}
            <div>
              <div style={chartStyles.bar}>Miles Driven</div>
              <div style={chartStyles.container}>
                {telematicsLoading ? <Skeleton style={{ height: '100%', borderRadius: 8 }} /> : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={monthlyMetrics.chartData} margin={{ top: 20, right: 30, left: 30, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="month" stroke="var(--text-secondary)" fontSize={12} tickLine={false} axisLine={false} padding={{ left: 20, right: 20 }} />
                      <YAxis stroke="var(--text-secondary)" fontSize={12} tickLine={false} axisLine={false} width={40} />
                      <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '4px' }} />
                      <Line type="monotone" dataKey="totalMiles" stroke="#d9a528" strokeWidth={5} dot={{ fill: '#d9a528', r: 6, strokeWidth: 0 }} activeDot={{ r: 8 }}>
                        <LabelList dataKey="totalMiles" position="top" offset={12} formatter={(val: any) => typeof val === 'number' && val >= 1000 ? `${(val / 1000).toFixed(0)}K` : val} style={{ fill: 'var(--text-secondary)', fontSize: '12px', fontWeight: 700 }} />
                      </Line>
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN - TABLES */}
          <div className="lg:col-span-4 flex flex-col gap-4 h-full">
            <div className="flex flex-col gap-2">
              {orgSettings.tracksDrivers && (
                <div className="flex gap-2 items-center">
                  <div className="toggle" style={{ height: 'fit-content', flex: 1 }}>
                    <button className={`toggle-btn ${viewMode === 'unit' ? 'active' : ''}`} onClick={() => setViewMode('unit')} style={{ flex: 1 }}>Unit</button>
                    <button className={`toggle-btn ${viewMode === 'driver' ? 'active' : ''}`} onClick={() => setViewMode('driver')} style={{ flex: 1 }}>Driver</button>
                  </div>
                </div>
              )}
              {viewMode === 'unit' ? (
                <MultiSelect options={unitOptions} selected={telematicsSelectedUnits} onChange={setTelematicsSelectedUnits} placeholder="Filter Units..." className="w-full" />
              ) : (
                orgSettings.tracksDrivers && (
                  <MultiSelect options={driverOptions} selected={telematicsSelectedDrivers} onChange={setTelematicsSelectedDrivers} placeholder="Filter Drivers..." className="w-full" />
                )
              )}
            </div>

            {/* Monthly Table */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div style={{ ...chartStyles.bar, justifyContent: 'space-between' }}>
                <span>Monthly Summary</span>
                {showYearToggle && (
                  <div className="flex gap-1">
                    {availableYears.map(year => (
                      <button key={year} onClick={(e) => { e.stopPropagation(); setSelectedTableYear(year); }} className={`text-xs px-2 py-1 rounded ${selectedTableYear === year ? 'bg-white text-primary font-bold' : 'bg-white/20 text-white hover:bg-white/30'}`}>
                        {year}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="table-container" style={{ flex: 1, minHeight: '400px', overflowY: 'auto', borderTopLeftRadius: 0, borderTopRightRadius: 0, borderTop: 'none' }}>
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
                    {monthlyMetrics.tableData.map((month) => (
                      <tr key={month.monthKey} style={{ opacity: month.totalMiles === 0 ? 0.5 : 1 }}>
                        <td style={{ fontWeight: '600' }}>{month.month}</td>
                        <td>{month.avgMpg.toFixed(2)}</td>
                        <td>{month.totalMiles.toLocaleString()}</td>
                        <td style={{ fontWeight: '600' }}>{month.idlePercentage.toFixed(2)}%</td>
                        <td>{month.idleFuel.toLocaleString()}</td>
                        <td>{month.idleTimeMinutes.toLocaleString()}</td>
                      </tr>
                    ))}
                    <tr style={{ background: 'var(--primary-dark)', color: 'white', fontWeight: '700' }}>
                      <td style={{ color: 'white' }}>Total</td>
                      <td style={{ color: 'white' }}>{fleetTotals.avgMpg}</td>
                      <td style={{ color: 'white' }}>{fleetTotals.totalMiles.toLocaleString()}</td>
                      <td style={{ color: 'white' }}>{fleetTotals.idlePercentage}%</td>
                      <td style={{ color: 'white' }}>{fleetTotals.totalIdleFuel.toLocaleString()}</td>
                      <td style={{ color: 'white' }}>{fleetTotals.totalIdleTime.toLocaleString()}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      ) : (
        // BREAKDOWN VIEW
        <div className="flex flex-col gap-6">
          <div className="grid lg:grid-cols-12 gap-6 h-[600px]">
            {/* LEFT COLUMN - KPI CARDS */}
            <div className="lg:col-span-3 flex flex-col gap-6 h-full">
              <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4 shadow-sm flex flex-col items-center justify-center flex-1">
                <div className="text-[var(--text-secondary)] text-sm font-medium uppercase tracking-wide mb-2">Idle %</div>
                <div className="text-4xl font-bold text-[var(--warning)]">{fleetTotals.idlePercentage}%</div>
              </div>
              <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4 shadow-sm flex flex-col items-center justify-center flex-1">
                <div className="text-[var(--text-secondary)] text-sm font-medium uppercase tracking-wide mb-2">Idle Fuel</div>
                <div className="text-4xl font-bold text-[var(--error)]">{fleetTotals.totalIdleFuel.toLocaleString()}</div>
                <div className="text-xs text-[var(--text-secondary)] mt-1">gallons</div>
              </div>
              <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4 shadow-sm flex flex-col items-center justify-center flex-1">
                <div className="text-[var(--text-secondary)] text-sm font-medium uppercase tracking-wide mb-2">Idle Time</div>
                <div className="text-4xl font-bold text-[var(--primary)]">{fleetTotals.totalIdleTime.toLocaleString()}</div>
                <div className="text-xs text-[var(--text-secondary)] mt-1">minutes</div>
              </div>
            </div>

            {/* RIGHT COLUMN - BREAKDOWN TABLE */}
            <div className="lg:col-span-9 flex flex-col h-full">
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div style={{ ...chartStyles.bar }}>
                  <span>{viewMode === 'unit' ? 'Unit Breakdown' : 'Driver Breakdown'}</span>
                </div>
                <div className="table-container" style={{ flex: 1, height: '100%', overflowY: 'auto', borderTopLeftRadius: 0, borderTopRightRadius: 0, borderTop: 'none', position: 'relative' }}>
                  <table className="table w-full table-fixed" style={{ position: 'relative' }}>
                    <thead style={{ ...tableHeaderStyle, top: -1 }}>
                      <tr>
                        <th style={{ color: 'white', width: '16.66%' }}>{viewMode === 'unit' ? 'Unit' : 'Driver'}</th>
                        <th style={{ color: 'white', width: '16.66%' }}>MPG</th>
                        <th style={{ color: 'white', width: '16.66%' }}>Miles</th>
                        <th style={{ color: 'white', width: '16.66%' }}>Idle %</th>
                        <th style={{ color: 'white', width: '16.66%' }}>Idle Fuel</th>
                        <th style={{ color: 'white', width: '16.66%' }}>Idle Time (mins)</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr style={{ background: 'var(--primary-dark)', color: 'white', fontWeight: '700' }}>
                        <td style={{ color: 'white' }}>Total</td>
                        <td style={{ color: 'white' }}>{fleetTotals.avgMpg}</td>
                        <td style={{ color: 'white' }}>{fleetTotals.totalMiles.toLocaleString()}</td>
                        <td style={{ color: 'white' }}>{fleetTotals.idlePercentage}%</td>
                        <td style={{ color: 'white' }}>{fleetTotals.totalIdleFuel.toLocaleString()}</td>
                        <td style={{ color: 'white' }}>{fleetTotals.totalIdleTime.toLocaleString()}</td>
                      </tr>
                      {viewMode === 'unit' ? (
                        unitMetrics.map((unit) => (
                          <tr key={unit.vin} onClick={() => handleRowClick(unit.vin)}
                            style={{ cursor: 'pointer', background: selectedId === unit.vin ? 'var(--bg-hover)' : undefined, borderLeft: selectedId === unit.vin ? '4px solid var(--primary)' : undefined }}>
                            <td style={{ fontWeight: '600' }}>{unit.unitNumber}</td>
                            <td>{unit.avgMpg}</td>
                            <td>{Math.round(unit.totalMiles).toLocaleString()}</td>
                            <td style={{ fontWeight: '600' }}>{unit.idlePercentage}%</td>
                            <td>{unit.idleFuel.toLocaleString()}</td>
                            <td>{unit.idleTimeMinutes.toLocaleString()}</td>
                          </tr>
                        ))
                      ) : (
                        driverMetrics.map((driver) => (
                          <tr key={driver.driverId} onClick={() => handleRowClick(driver.driverId)}
                            style={{ cursor: 'pointer', background: selectedId === driver.driverId ? 'var(--bg-hover)' : undefined, borderLeft: selectedId === driver.driverId ? '4px solid var(--primary)' : undefined }}>
                            <td style={{ fontWeight: '600' }}>{driver.driverName}</td>
                            <td>{driver.avgMpg}</td>
                            <td>{Math.round(driver.totalMiles).toLocaleString()}</td>
                            <td style={{ fontWeight: '600' }}>{driver.idlePercentage}%</td>
                            <td>{driver.idleFuel.toLocaleString()}</td>
                            <td>{driver.idleTimeMinutes.toLocaleString()}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>

          {/* Top/Bottom Performers Panel */}
          {viewMode === 'unit' && unitMetrics.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Worst Idlers */}
              <div className="bg-bg-card border border-border rounded shadow-sm overflow-hidden">
                <div style={chartStyles.bar}>Worst Idlers (Top 5)</div>
                <div style={{ padding: '1rem', height: 260 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topIdleUnits} layout="vertical" margin={{ top: 4, right: 50, left: 8, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                      <XAxis type="number" stroke="var(--text-secondary)" fontSize={11} tickLine={false} axisLine={false} unit="%" />
                      <YAxis type="category" dataKey="unitNumber" width={80} stroke="var(--text-secondary)" fontSize={11} tickLine={false} axisLine={false} tick={{ fill: 'var(--text-secondary)' }} />
                      <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 4 }} formatter={(v: unknown) => [`${v}%`, 'Idle %']} />
                      <Bar dataKey="idlePercentage" fill="#ef4444" radius={[0, 3, 3, 0]} isAnimationActive={false}
                        onClick={(data: any) => { if (data?.vin) router.push(`/app/units/${data.vin}`); }}>
                        <LabelList dataKey="idlePercentage" position="right" formatter={(v: any) => `${v}%`} style={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-xs text-muted-foreground px-4 pb-3">Click a bar to view unit detail.</p>
              </div>

              {/* Best MPG */}
              <div className="bg-bg-card border border-border rounded shadow-sm overflow-hidden">
                <div style={chartStyles.bar}>Best MPG (Top 5)</div>
                <div style={{ padding: '1rem', height: 260 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topMpgUnits} layout="vertical" margin={{ top: 4, right: 50, left: 8, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                      <XAxis type="number" stroke="var(--text-secondary)" fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis type="category" dataKey="unitNumber" width={80} stroke="var(--text-secondary)" fontSize={11} tickLine={false} axisLine={false} tick={{ fill: 'var(--text-secondary)' }} />
                      <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 4 }} formatter={(v: any) => [v, 'MPG']} />
                      <Bar dataKey="avgMpg" fill="#22c55e" radius={[0, 3, 3, 0]} isAnimationActive={false}
                        onClick={(data: any) => { if (data?.vin) router.push(`/app/units/${data.vin}`); }}>
                        <LabelList dataKey="avgMpg" position="right" style={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {orgSettings.tracksDrivers && (
                  <div className="px-4 pb-3">
                    <button className="btn btn-secondary text-xs" onClick={() => router.push('/app/drivers')}>
                      View Driver Scorecard
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
