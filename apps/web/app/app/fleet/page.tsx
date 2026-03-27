'use client';

import { useOrganization } from '@clerk/nextjs';
import { useState, useEffect, useMemo } from 'react';
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
import { KpiCard } from '@/components/KpiCard';
import { RepairBreakdown, isDamageInvoice, type RepairUnitSummary } from './RepairBreakdown';
import { TelematicsTrendsView } from './TelematicsTrendsView';
import { TelematicsBreakdownView } from './TelematicsBreakdownView';
import type { UnitMetrics, DriverMetrics, MonthlyMetrics } from './types';

const defaultOrgSettings = {
  tracksDrivers: true,
  telematicsProvider: null as 'MOTIVE' | 'SAMSARA' | null,
  contractStartDate: null as string | null,
};

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

const getMonthName = (monthIndex: number) =>
  new Date(2000, monthIndex, 1).toLocaleString('default', { month: 'long' });

export default function FleetOverviewPage() {
  const { organization, isLoaded: orgLoaded } = useOrganization();

  const [activeTab, setActiveTab] = useState<'telematics' | 'repairs'>('telematics');
  const [viewMode, setViewMode] = useState<'unit' | 'driver'>('unit');
  const [selectedId, setSelectedId] = useState<string | number | null>(null);
  const [telematicsView, setTelematicsView] = useState<'trends' | 'breakdown'>('trends');

  const [telematicsSelectedUnits, setTelematicsSelectedUnits] = useState<string[]>([]);
  const [telematicsSelectedDrivers, setTelematicsSelectedDrivers] = useState<string[]>([]);

  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
  const [selectedYears, setSelectedYears] = useState<string[]>([]);
  const [selectedUnits, setSelectedUnits] = useState<string[]>([]);
  void selectedMonths; void selectedYears; void selectedUnits;

  const [repairEndDate, setRepairEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [repairStartDate, setRepairStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 12);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
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

  const canLoadDrivers = orgSettings.tracksDrivers && orgSettings.telematicsProvider === 'MOTIVE';
  const driverUtilQuery = useDriverUtilizationQuery(canLoadDrivers);

  const repairsQuery = useRepairsQuery();

  const telematicsLoading =
    !orgLoaded ||
    orgSettingsQuery.isLoading ||
    fleetUnitsQuery.isLoading ||
    vehicleUtilQuery.isLoading;

  const telematicsError =
    (fleetUnitsQuery.error as Error | null)?.message ||
    (vehicleUtilQuery.error as Error | null)?.message ||
    null;
  void telematicsError;

  const repairsLoading = repairsQuery.isLoading;
  const repairsError = (repairsQuery.error as Error | null)?.message || null;

  const orgSettingsError = !orgErrorDismissed
    ? (orgSettingsQuery.error as Error | null)?.message ?? null
    : null;

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

  useEffect(() => {
    if (orgSettingsQuery.data && !orgSettingsQuery.data.tracksDrivers && viewMode === 'driver') {
      setViewMode('unit');
    }
  }, [orgSettingsQuery.data, viewMode]);

  // --- Build raw data arrays ---
  const vehicleData = useMemo((): VehicleUtilization[] => {
    if (!fleetUnitsQuery.data || !vehicleUtilQuery.data) return [];
    const includedVins = new Set(
      fleetUnitsQuery.data.units.filter(u => u.telematicsVin).map(u => u.telematicsVin!)
    );
    return vehicleUtilQuery.data.filter(v => v.vin && includedVins.has(v.vin));
  }, [fleetUnitsQuery.data, vehicleUtilQuery.data]);

  const driverData = useMemo<DriverUtilization[]>(() => driverUtilQuery.data ?? [], [driverUtilQuery.data]);
  const repairUnits = useMemo<RepairUnitSummary[]>(() => repairsQuery.data?.units ?? [], [repairsQuery.data]);

  useEffect(() => {
    const startYear = new Date(startDate).getFullYear();
    const endYear = new Date(endDate).getFullYear();
    if (selectedTableYear < startYear || selectedTableYear > endYear) {
      setSelectedTableYear(endYear);
    }
  }, [startDate, endDate, selectedTableYear]);

  useEffect(() => {
    setSelectedId(null);
  }, [viewMode]);

  // Date Filtering
  const dateFilteredVehicleData = useMemo(
    () => vehicleData.filter(r => r.date >= startDate && r.date <= endDate),
    [vehicleData, startDate, endDate]
  );

  const dateFilteredDriverData = useMemo(
    () => driverData.filter(r => r.date >= startDate && r.date <= endDate),
    [driverData, startDate, endDate]
  );

  // Options Generation
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

  // Selection Filtering
  const filteredVehicleData = useMemo(() => {
    if (telematicsSelectedUnits.length === 0) return dateFilteredVehicleData;
    return dateFilteredVehicleData.filter(r => r.vin && telematicsSelectedUnits.includes(r.vin));
  }, [dateFilteredVehicleData, telematicsSelectedUnits]);

  const filteredDriverData = useMemo(() => {
    if (telematicsSelectedDrivers.length === 0) return dateFilteredDriverData;
    return dateFilteredDriverData.filter(
      r => r.driverId && telematicsSelectedDrivers.includes(r.driverId.toString())
    );
  }, [dateFilteredDriverData, telematicsSelectedDrivers]);

  // --- Aggregation ---
  const unitMetrics = useMemo((): UnitMetrics[] => {
    const grouped = new Map<string, {
      vin: string; unitNumber: string; totalMiles: number;
      totalIdleTime: number; totalDrivingTime: number;
      totalFuel: number; totalIdleFuel: number; days: number;
    }>();
    filteredVehicleData.forEach(record => {
      if (!record.vin) return;
      const existing = grouped.get(record.vin) || {
        vin: record.vin,
        unitNumber: record.vehicleNumber || record.vin.slice(-6),
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
        vin: unit.vin,
        unitNumber: unit.unitNumber,
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
        driverId: driver.driverId,
        driverName: driver.driverName,
        totalMiles: driver.totalMiles,
        avgMpg:
          driver.totalFuel > 0 && driver.totalMiles > 0
            ? (driver.totalMiles / driver.totalFuel).toFixed(2)
            : '0.00',
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

    const chartData: MonthlyMetrics[] = Array.from(monthlyMap.entries())
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

    const tableData: MonthlyMetrics[] = Array.from({ length: 12 }, (_, i) => {
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
      totalMiles,
      totalIdleFuel,
      totalIdleTime: Math.round(totalIdleTime / 60),
      avgMpg: totalFuel > 0 ? (totalMiles / totalFuel).toFixed(2) : '0.00',
      idlePercentage: idlePct.toFixed(2),
    };
  }, [filteredVehicleData, filteredDriverData, viewMode, selectedTableYear]);

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

  const repairKpis = useMemo(() => {
    let totalJobs = 0, damageJobs = 0;
    repairUnits.forEach(u => {
      const filteredInvoices = u.invoices.filter(
        inv => inv.invoiceDate >= repairStartDate && inv.invoiceDate <= repairEndDate
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

  const showYearToggle = useMemo(() => {
    return new Date(endDate).getFullYear() > new Date(startDate).getFullYear();
  }, [startDate, endDate]);

  const availableYears = useMemo(() => {
    const startYear = new Date(startDate).getFullYear();
    const endYear = new Date(endDate).getFullYear();
    const years: number[] = [];
    for (let y = startYear; y <= endYear; y++) years.push(y);
    return years;
  }, [startDate, endDate]);

  return (
    <div className="w-full p-6">
      {/* Page Header */}
      <div className="page-header relative">
        <div className="flex flex-col gap-2">
          <div>
            <h1 style={{ fontSize: '2rem', fontWeight: '700', marginBottom: '0.5rem' }}>Fleet Overview</h1>
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
        <div
          className="page-header-controls"
          style={{ display: 'flex', gap: '1rem', alignItems: 'center', justifyContent: 'flex-end', flex: 1, flexWrap: 'wrap' }}
        >
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
        <KpiCard label="Total Fleet Miles" value={telematicsLoading ? '—' : fleetKpis.totalMiles.toLocaleString()} subtext="miles" />
        <KpiCard label="Fleet Avg MPG" value={telematicsLoading ? '—' : fleetKpis.avgMpg} />
        <KpiCard
          label="Idle %"
          value={telematicsLoading ? '—' : `${fleetKpis.idlePct}%`}
          variant={!telematicsLoading && parseFloat(fleetKpis.idlePct) > 30 ? 'warning' : 'default'}
        />
        <KpiCard label="Idle Fuel" value={telematicsLoading ? '—' : fleetKpis.idleFuel.toLocaleString()} subtext="gallons" />
        <KpiCard label="Total Repair Jobs" value={repairsLoading ? '—' : repairKpis.totalJobs} />
        <KpiCard
          label="Jobs with Damage"
          value={repairsLoading ? '—' : repairKpis.damageJobs}
          variant={!repairsLoading && repairKpis.damageJobs > 0 ? 'warning' : 'default'}
        />
      </div>

      {/* Tab Bar */}
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

      {/* Tab Content */}
      {activeTab === 'repairs' ? (
        <RepairBreakdown
          units={repairUnits}
          loading={repairsLoading}
          error={repairsError}
          startDate={repairStartDate}
          endDate={repairEndDate}
        />
      ) : telematicsView === 'trends' ? (
        <TelematicsTrendsView
          loading={telematicsLoading}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          tracksDrivers={orgSettings.tracksDrivers}
          selectedId={selectedId}
          onSelectedIdChange={setSelectedId}
          unitMetrics={unitMetrics}
          driverMetrics={driverMetrics}
          unitOptions={unitOptions}
          driverOptions={driverOptions}
          selectedUnits={telematicsSelectedUnits}
          selectedDrivers={telematicsSelectedDrivers}
          onUnitsChange={setTelematicsSelectedUnits}
          onDriversChange={setTelematicsSelectedDrivers}
          monthlyMetrics={monthlyMetrics}
          fleetTotals={fleetTotals}
          showYearToggle={showYearToggle}
          availableYears={availableYears}
          selectedTableYear={selectedTableYear}
          onTableYearChange={setSelectedTableYear}
        />
      ) : (
        <TelematicsBreakdownView
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          tracksDrivers={orgSettings.tracksDrivers}
          unitMetrics={unitMetrics}
          driverMetrics={driverMetrics}
          fleetTotals={fleetTotals}
          selectedId={selectedId}
          onRowClick={id => setSelectedId(selectedId === id ? null : id)}
          showDriverScorecard={orgSettings.tracksDrivers}
        />
      )}
    </div>
  );
}
