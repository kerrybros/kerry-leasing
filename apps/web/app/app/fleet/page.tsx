'use client';

import { useOrganization } from '@clerk/nextjs';
import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError } from '@/lib/api';
import { useApiClient } from '@/hooks/useApiClient';
import { useOrgSettings } from '@/hooks/useOrgSettings';
import { DateRangePicker } from '@/components/DateRangePicker';
import { MultiSelect } from '@/components/MultiSelect';
import { Skeleton } from '@/components/Skeleton';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList, BarChart, Bar, Legend } from 'recharts';

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

// Helper to format long date (e.g. "January 1st 2026")
const formatLongDate = (dateStr: string) => {
  const d = new Date(dateStr);
  const month = d.toLocaleString('default', { month: 'long' });
  const day = d.getDate();
  const year = d.getFullYear();
  
  const suffix = (day: number) => {
    if (day > 3 && day < 21) return 'th';
    switch (day % 10) {
      case 1: return 'st';
      case 2: return 'nd';
      case 3: return 'rd';
      default: return 'th';
    }
  };

  return `${month} ${day}${suffix(day)} ${year}`;
};

import { RepairBreakdown, type RepairUnitSummary } from './RepairBreakdown';

interface VehicleUtilization {
  vehicleId: number;
  vehicleNumber: string | null;
  vin: string | null;
  date: string;
  totalDistance: number | null;
  idleTime: number | null;      // seconds
  drivingTime: number | null;   // seconds
  totalFuel: number | null;     // gallons
  idleFuel: number | null;      // gallons
}

interface DriverUtilization {
  driverId: number;
  driverFirstName: string | null;
  driverLastName: string | null;
  date: string;
  utilization: number | null;
  drivingTime: number | null;
  idleTime: number | null;
  drivingFuel: number | null;
  idleFuel: number | null;
  totalDistance?: number | null; // Assuming we might map this or it might be missing
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

// Helper to get month name
const getMonthName = (monthIndex: number) => {
  return new Date(2000, monthIndex, 1).toLocaleString('default', { month: 'long' });
};

export default function FleetOverviewPage() {
  const router = useRouter();
  const { getApi } = useApiClient();
  const { organization, isLoaded: orgLoaded } = useOrganization();
  
  const [activeTab, setActiveTab] = useState<'telematics' | 'repairs'>('telematics');
  const [viewMode, setViewMode] = useState<'unit' | 'driver'>('unit');
  const [selectedId, setSelectedId] = useState<string | number | null>(null); // VIN (string) or DriverID (number)
  
  const { orgSettings, orgSettingsError, loadOrgSettings, clearOrgSettingsError } = useOrgSettings(getApi);
  
  // Telematics View State
  const [telematicsView, setTelematicsView] = useState<'trends' | 'breakdown'>('trends');
  const [telematicsSelectedUnits, setTelematicsSelectedUnits] = useState<string[]>([]);
  const [telematicsSelectedDrivers, setTelematicsSelectedDrivers] = useState<string[]>([]);

  const [telematicsLoading, setTelematicsLoading] = useState(true);
  const [telematicsError, setTelematicsError] = useState<string | null>(null);
  const [vehicleData, setVehicleData] = useState<VehicleUtilization[]>([]);
  const [driverData, setDriverData] = useState<DriverUtilization[]>([]);
  const [repairUnits, setRepairUnits] = useState<RepairUnitSummary[]>([]);
  const [repairsLoading, setRepairsLoading] = useState(false);
  const [repairsError, setRepairsError] = useState<string | null>(null);
  const [telematicsLoaded, setTelematicsLoaded] = useState(false);
  const [repairsLoaded, setRepairsLoaded] = useState(false);

  const telematicsInFlightRef = useRef(false);
  const repairsInFlightRef = useRef(false);
  const orgIdRef = useRef<string | null>(null);
  const isInitialMount = useRef(true);
  
  // Repair filters
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
  const [selectedYears, setSelectedYears] = useState<string[]>([]);
  const [selectedUnits, setSelectedUnits] = useState<string[]>([]);

  const [repairEndDate, setRepairEndDate] = useState(() => {
    // Default to the contract start date + 1 year, or today if that's in the past
    // Actually, usually we just want "today" as the end date
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  
  // Initialize with a safe default (12 months ago), will be updated by API
  const [repairStartDate, setRepairStartDate] = useState(() => {
    const date = new Date();
    date.setMonth(date.getMonth() - 12); 
    return date.toISOString().split('T')[0];
  });
  
  // Date range state
  const [endDate, setEndDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setMonth(date.getMonth() - 12);
    return date.toISOString().split('T')[0];
  });

  const [selectedTableYear, setSelectedTableYear] = useState<number>(new Date().getFullYear());

  // Reset selected table year when date range changes
  useEffect(() => {
    const startYear = new Date(startDate).getFullYear();
    const endYear = new Date(endDate).getFullYear();
    
    // If current selected year is out of range, reset to end year (most recent)
    if (selectedTableYear < startYear || selectedTableYear > endYear) {
      setSelectedTableYear(endYear);
    }
  }, [startDate, endDate, selectedTableYear]);

  // Reset page data when switching organizations
  useEffect(() => {
    // Wait for Clerk to load organization
    if (!orgLoaded) return;
    
    const orgId = organization?.id || null;
    
    // Skip on initial mount
    if (isInitialMount.current) {
      isInitialMount.current = false;
      orgIdRef.current = orgId;
      return;
    }
    
    // Detect org change (switching between orgs)
    if (orgIdRef.current && orgId && orgIdRef.current !== orgId) {
      console.log(`[OrgSwitch] Detected org change from ${orgIdRef.current} to ${orgId}`);
      console.log(`[OrgSwitch] Reloading page in 100ms...`);
      
      // Small delay to ensure Clerk state is fully updated
      setTimeout(() => {
        window.location.reload();
      }, 100);
    }
    
    orgIdRef.current = orgId;
  }, [organization?.id, orgLoaded]);

  // Prefetch BOTH datasets once per org so tab switching never "reloads"
  useEffect(() => {
    if (!organization) return;

    // Load settings first, then load data
    const loadDataSequentially = async () => {
      const settings = await loadOrgSettingsAndApply();
      if (!telematicsLoaded && !telematicsInFlightRef.current) {
        loadTelematicsData({ provider: settings.telematicsProvider });
      }
      if (!repairsLoaded && !repairsInFlightRef.current) {
        loadRepairData();
      }
    };
    
    loadDataSequentially();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organization?.id, telematicsLoaded, repairsLoaded]);

  const loadOrgSettingsAndApply = async () => {
    const settings = await loadOrgSettings();
    if (!settings.tracksDrivers && viewMode === 'driver') {
      setViewMode('unit');
    }
    if (settings.contractStartDate) {
      setStartDate(settings.contractStartDate);
    }
    return settings;
  };

  // Reset selection when switching view modes
  useEffect(() => {
    setSelectedId(null);
  }, [viewMode]);

  const loadTelematicsData = async (opts?: { force?: boolean; provider?: 'MOTIVE' | 'SAMSARA' | null }) => {
    const force = opts?.force === true;
    if (!force && (telematicsLoaded || telematicsInFlightRef.current)) return;
    telematicsInFlightRef.current = true;

    setTelematicsLoading(true);
    setTelematicsError(null);
    try {
      const t0 = performance.now();
      const fetchedAt = new Date().toISOString();
      const api = await getApi();
      
      // Load all included units from the fleet endpoint
      // This returns only units marked as included in the service plan
      // with combined telematics and repair data
      const fleetResponse = await api.get<{
        units: Array<{
          servicePlanId: string;
          repairUnitNumber: string | null;
          matchType: string;
          repairVin: string | null;
          telematicsVin: string | null;
          telematics: any | null;
          repair: any | null;
          lastSyncedAt: string | null;
        }>;
        total: number;
      }>('/fleet/units');
      
      // Extract telematics VINs from fleet response
      const includedVins = new Set(
        fleetResponse.units
          .filter(u => u.telematicsVin)
          .map(u => u.telematicsVin!)
      );
      
      // Load telematics data based on provider
      // Both Motive and Samsara return data in the same VehicleUtilization format
      let filteredVehicleUtil: VehicleUtilization[] = [];
      
      // Use passed provider or fall back to state (for backward compatibility)
      const telematicsProvider = opts?.provider ?? orgSettings.telematicsProvider;
      
      if (telematicsProvider === 'MOTIVE') {
        const resp = await api.get<{ data: VehicleUtilization[] }>('/telematics/motive/vehicle-utilization?pageSize=50000');
        filteredVehicleUtil = resp.data.filter(v => v.vin && includedVins.has(v.vin));
      } else if (telematicsProvider === 'SAMSARA') {
        const resp = await api.get<{ data: VehicleUtilization[] }>('/telematics/samsara/vehicle-stats?pageSize=50000');
        filteredVehicleUtil = resp.data.filter(v => v.vin && includedVins.has(v.vin));
      }
      
      // For drivers, only load if org tracks drivers
      let filteredDriverUtil: DriverUtilization[] = [];
      if (orgSettings.tracksDrivers) {
        try {
          // Only Motive has driver data currently
          // Samsara driver endpoint not yet implemented
          if (telematicsProvider === 'MOTIVE') {
            const driverUtil = await api.get<DriverUtilization[]>('/telematics/motive/driver-utilization');
            filteredDriverUtil = driverUtil;
          }
        } catch (err) {
          // Driver data not available - silent fail
        }
      }
      
      setVehicleData(filteredVehicleUtil);
      setDriverData(filteredDriverUtil);
      setTelematicsLoaded(true);

      const elapsedMs = Math.round(performance.now() - t0);
      console.log('[TelematicsData] Loaded', {
        fetchedAt,
        includedUnitCount: fleetResponse.units.length,
        vehicleRows: filteredVehicleUtil.length,
        driverRows: filteredDriverUtil.length,
        elapsedMs,
      });
      
    } catch (err) {
      if (err instanceof ApiError) {
        setTelematicsError(err.message);
      } else {
        setTelematicsError('Failed to load telematics data');
      }
      console.error(err);
    } finally {
      setTelematicsLoading(false);
      telematicsInFlightRef.current = false;
    }
  };

  const loadRepairData = async (opts?: { force?: boolean }) => {
    const force = opts?.force === true;
    if (!force && (repairsLoaded || repairsInFlightRef.current)) return;
    repairsInFlightRef.current = true;

    setRepairsLoading(true);
    setRepairsError(null);
    try {
      const t0 = performance.now();
      const fetchedAt = new Date().toISOString();
      const api = await getApi();

      const repairs = await api.get<{
        customer?: {
          klOrgId: string;
          customerName: string;
          contractStartDate: string;
        };
        period?: {
          from: string;
          to: string;
        };
        units: RepairUnitSummary[];
        summary: {
          unitCount: number;
          invoiceCount: number;
          lineRowCount: number;
          total: number;
          tax: number;
        };
      }>('/repairs');

      setRepairUnits(repairs.units);
      
      // Update start date from contract if available
      if (repairs.customer?.contractStartDate) {
        const contractDate = repairs.customer.contractStartDate;
        setRepairStartDate(contractDate);
      }
      
      setRepairsLoaded(true);

      const elapsedMs = Math.round(performance.now() - t0);
      console.log('[RepairData] Loaded', {
        fetchedAt,
        unitCount: repairs.summary.unitCount,
        invoiceCount: repairs.summary.invoiceCount,
        lineRowCount: repairs.summary.lineRowCount,
        elapsedMs,
      });
      
    } catch (err) {
      if (err instanceof ApiError) {
        setRepairsError(err.message);
      } else {
        setRepairsError('Failed to load repair data');
      }
      console.error('[RepairData] Load error:', err);
    } finally {
      setRepairsLoading(false);
      repairsInFlightRef.current = false;
    }
  };

  // 1. Date Filtering
  const dateFilteredVehicleData = useMemo(() => 
    vehicleData.filter(r => r.date >= startDate && r.date <= endDate),
  [vehicleData, startDate, endDate]);
  
  const dateFilteredDriverData = useMemo(() => 
    driverData.filter(r => r.date >= startDate && r.date <= endDate),
  [driverData, startDate, endDate]);

  // 2. Options Generation (from date-filtered data)
  const unitOptions = useMemo(() => {
    const unique = new Set<string>();
    const opts: { label: string; value: string }[] = [];
    dateFilteredVehicleData.forEach(v => {
      if (v.vin && !unique.has(v.vin)) {
        unique.add(v.vin);
        opts.push({ 
          label: v.vehicleNumber || v.vin.slice(-6), 
          value: v.vin 
        });
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
        opts.push({ 
          label: name, 
          value: d.driverId.toString() 
        });
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

  // 1. Table Data (Aggregated by Unit or Driver for the selected period)
  const unitMetrics = useMemo((): UnitMetrics[] => {
    const grouped = new Map<string, {
      vin: string;
      unitNumber: string;
      totalMiles: number;
      totalIdleTime: number;
      totalDrivingTime: number;
      totalFuel: number;
      totalIdleFuel: number;
      days: number;
    }>();

    filteredVehicleData.forEach(record => {
      if (!record.vin) return;
      
      const existing = grouped.get(record.vin) || {
        vin: record.vin,
        unitNumber: record.vehicleNumber || record.vin.slice(-6),
        totalMiles: 0,
        totalIdleTime: 0,
        totalDrivingTime: 0,
        totalFuel: 0,
        totalIdleFuel: 0,
        days: 0,
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
      driverId: number;
      driverName: string;
      totalMiles: number;
      totalIdleTime: number;
      totalDrivingTime: number;
      totalFuel: number;
      totalIdleFuel: number;
      days: number;
    }>();

    filteredDriverData.forEach(record => {
      if (!record.driverId) return;

      const existing = grouped.get(record.driverId) || {
        driverId: record.driverId,
        driverName: `${record.driverFirstName || ''} ${record.driverLastName || ''}`.trim() || `Driver ${record.driverId}`,
        totalMiles: 0,
        totalIdleTime: 0,
        totalDrivingTime: 0,
        totalFuel: 0,
        totalIdleFuel: 0,
        days: 0,
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
        avgMpg: driver.totalFuel > 0 && driver.totalMiles > 0 ? (driver.totalMiles / driver.totalFuel).toFixed(2) : '0.00',
        idlePercentage: idlePct.toFixed(2),
        idleFuel: Math.round(driver.totalIdleFuel),
        idleTimeMinutes: Math.round(driver.totalIdleTime / 60),
      };
    });
  }, [filteredDriverData]);

  // 2. Chart Data (Monthly aggregation, optionally filtered by selectedId)
  // Also used for Table Data
  const monthlyMetrics = useMemo(() => {
    const monthlyMap = new Map<string, {
      totalMiles: number;
      totalIdleTime: number;
      totalDrivingTime: number;
      totalFuel: number;
      totalIdleFuel: number;
      days: number;
    }>();

    // Select source based on viewMode
    let sourceData: any[] = [];
    if (viewMode === 'unit') {
      sourceData = filteredVehicleData;
      // Filter by selected ID if present
      if (selectedId) {
        sourceData = sourceData.filter(r => r.vin === selectedId);
      }
    } else {
      sourceData = filteredDriverData;
      // Filter by selected ID if present
      if (selectedId) {
        sourceData = sourceData.filter(r => r.driverId === selectedId);
      }
    }

    sourceData.forEach(record => {
      const monthKey = record.date.substring(0, 7); // YYYY-MM
      
      const existing = monthlyMap.get(monthKey) || {
        totalMiles: 0,
        totalIdleTime: 0,
        totalDrivingTime: 0,
        totalFuel: 0,
        totalIdleFuel: 0,
        days: 0,
      };

      const miles = record.totalDistance || 0;
      const idleTime = record.idleTime || 0;
      const idleFuel = record.idleFuel || 0;
      const drivingTime = viewMode === 'unit'
        ? (record as VehicleUtilization).drivingTime || 0
        : (record as DriverUtilization).drivingTime || 0;
      
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

    // Convert map to array for Charts (only months with data in range)
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
          month: label,
          monthKey,
          totalMiles: Math.round(data.totalMiles),
          avgMpg: data.totalFuel > 0 ? parseFloat((data.totalMiles / data.totalFuel).toFixed(2)) : 0,
          idlePercentage: parseFloat(idlePctFromData(data).toFixed(2)),
          idleFuel: Math.round(data.totalIdleFuel),
          idleTimeMinutes: Math.round(data.totalIdleTime / 60),
        };
      });

    // Generate full 12-month array for Table based on selectedTableYear
    const tableData = Array.from({ length: 12 }, (_, i) => {
      const monthNum = i + 1;
      const monthKey = `${selectedTableYear}-${String(monthNum).padStart(2, '0')}`;
      const data = monthlyMap.get(monthKey);
      
      if (data) {
        return {
          month: getMonthName(i),
          monthKey,
          totalMiles: Math.round(data.totalMiles),
          avgMpg: data.totalFuel > 0 ? parseFloat((data.totalMiles / data.totalFuel).toFixed(2)) : 0,
          idlePercentage: parseFloat(idlePctFromData(data).toFixed(2)),
          idleFuel: Math.round(data.totalIdleFuel),
          idleTimeMinutes: Math.round(data.totalIdleTime / 60),
        };
      } else {
        return {
          month: getMonthName(i),
          monthKey,
          totalMiles: 0,
          avgMpg: 0,
          idlePercentage: 0,
          idleFuel: 0,
          idleTimeMinutes: 0
        };
      }
    });

    return { chartData, tableData };
  }, [filteredVehicleData, filteredDriverData, viewMode, selectedId, selectedTableYear, startDate, endDate]);

  // Calculate totals for the footer (Table Data Only)
  const totals = useMemo(() => {
    // Sum only from the 12 months currently shown in table
    return monthlyMetrics.tableData.reduce((acc, m) => ({
      totalMiles: acc.totalMiles + m.totalMiles,
      totalIdleFuel: acc.totalIdleFuel + m.idleFuel,
      totalIdleTime: acc.totalIdleTime + m.idleTimeMinutes,
      // Accumulate weighted sums for averages
      weightedMpgSum: acc.weightedMpgSum + (m.totalMiles), // Just sum miles for now, need fuel
      // Actually we don't have raw fuel in tableData rows easily available without re-calc.
      // But we can just sum up the displayed columns for totals where it makes sense (Miles, Fuel, Time)
      // For MPG and Idle %, averaging averages is wrong.
      // We need to re-sum raw data FOR THIS YEAR.
    }), { totalMiles: 0, totalIdleFuel: 0, totalIdleTime: 0, weightedMpgSum: 0 });
  }, [monthlyMetrics.tableData]);

  // Re-calculate accurate fleet totals from raw data for the footer (For selected Year)
  const fleetTotals = useMemo(() => {
    const data = viewMode === 'unit' ? filteredVehicleData : filteredDriverData;
    let totalMiles = 0;
    let totalFuel = 0;
    let totalIdleTime = 0;
    let totalDrivingTime = 0;
    let totalIdleFuel = 0;

    data.forEach(r => {
      if (r.date.startsWith(String(selectedTableYear))) {
        totalMiles += r.totalDistance || 0;
        totalIdleTime += r.idleTime || 0;
        totalDrivingTime += viewMode === 'unit'
          ? (r as VehicleUtilization).drivingTime || 0
          : (r as DriverUtilization).drivingTime || 0;
        totalIdleFuel += r.idleFuel || 0;
        
        if (viewMode === 'unit') {
          totalFuel += (r as VehicleUtilization).totalFuel || 0;
        } else {
          totalFuel += ((r as DriverUtilization).drivingFuel || 0) + ((r as DriverUtilization).idleFuel || 0);
        }
      }
    });

    const engineOnTime = totalIdleTime + totalDrivingTime;
    const idlePct = engineOnTime > 0 ? (totalIdleTime / engineOnTime) * 100 : 0;

    return {
      totalMiles,
      totalIdleFuel,
      totalIdleTime: Math.round(totalIdleTime / 60),
      avgMpg: totalFuel > 0 ? (totalMiles / totalFuel).toFixed(2) : '0.00',
      idlePercentage: idlePct.toFixed(2)
    };
  }, [filteredVehicleData, filteredDriverData, viewMode, selectedTableYear]);

  // Handle row click
  const handleRowClick = (id: string | number) => {
    if (selectedId === id) {
      setSelectedId(null); // Toggle off
    } else {
      setSelectedId(id);
    }
  };

  const navigateToDetails = (e: React.MouseEvent, id: string | number) => {
    e.stopPropagation(); // Prevent row click
    if (viewMode === 'unit') {
      router.push(`/app/units/${id}`);
    } else {
      // Driver details page not yet implemented, maybe do nothing or alert
      // router.push(`/app/drivers/${id}`); 
    }
  };

  // Calculate Top 5 Lists for Breakdown View
  const topIdleUnits = useMemo(() => {
    return [...unitMetrics]
      .sort((a, b) => parseFloat(b.idlePercentage) - parseFloat(a.idlePercentage))
      .slice(0, 5);
  }, [unitMetrics]);

  const topMpgUnits = useMemo(() => {
    // Sort by MPG descending (Best MPG) or Ascending (Worst MPG)? 
    // Usually "Top" implies best, but for fleet management, finding worst is often more useful.
    // Let's show Best MPG for now as "Top".
    return [...unitMetrics]
      .sort((a, b) => parseFloat(b.avgMpg) - parseFloat(a.avgMpg))
      .slice(0, 5);
  }, [unitMetrics]);

  // Determine if year toggle is needed
  const showYearToggle = useMemo(() => {
    const startYear = new Date(startDate).getFullYear();
    const endYear = new Date(endDate).getFullYear();
    return endYear > startYear;
  }, [startDate, endDate]);

  const availableYears = useMemo(() => {
    const startYear = new Date(startDate).getFullYear();
    const endYear = new Date(endDate).getFullYear();
    const years = [];
    for (let y = startYear; y <= endYear; y++) {
      years.push(y);
    }
    return years;
  }, [startDate, endDate]);

  return (
    <div className="container" style={{ maxWidth: '1800px' }}>
      <div className="page-header relative">
        <div className="flex flex-col gap-2">
          <div>
            <h1 style={{ fontSize: '2rem', fontWeight: '700', marginBottom: '0.5rem' }}>
              Fleet Overview
            </h1>
            <p style={{ color: 'var(--text-secondary)' }}>
              {organization?.name}
            </p>
          </div>
          
          {/* Centered Date Range Display */}
          {(activeTab === 'repairs' || activeTab === 'telematics') && (
            <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-bg-card px-6 py-2 rounded-lg border border-border shadow-sm text-center min-w-[400px]">
              <div className="text-xs text-text-secondary uppercase tracking-wider font-semibold mb-1">
                {activeTab === 'repairs' ? 'Showing Repairs For' : 'Showing Telematics For'}
              </div>
              <div className="text-xl font-bold text-text-primary">
                {activeTab === 'repairs' 
                  ? `${formatLongDate(repairStartDate)} - ${formatLongDate(repairEndDate)}`
                  : `${formatLongDate(startDate)} - ${formatLongDate(endDate)}`
                }
              </div>
            </div>
          )}
        </div>
        
        <div className="page-header-controls" style={{ display: 'flex', gap: '1rem', alignItems: 'center', justifyContent: 'flex-end', flex: 1, flexWrap: 'wrap' }}>
          {/* Date Picker always in the same spot (right side) */}
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
            onClick={clearOrgSettingsError}
            className="shrink-0 px-2 py-1 rounded hover:bg-amber-500/20 transition-colors"
            aria-label="Dismiss"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="tabs flex justify-between items-end">
        <div className="flex gap-2">
          <button
            className={`tab ${activeTab === 'telematics' ? 'active' : ''}`}
            onClick={() => setActiveTab('telematics')}
          >
            Telematics
          </button>
          <button
            className={`tab ${activeTab === 'repairs' ? 'active' : ''}`}
            onClick={() => setActiveTab('repairs')}
          >
            Repair Data
          </button>
        </div>

        {activeTab === 'telematics' && (
          <div className="flex items-center gap-4 mb-2">
            {/* Unit / Driver Toggle - Only show if org tracks drivers */}
            {orgSettings.tracksDrivers && (
              <div className="toggle">
                <button
                  className={`toggle-btn ${viewMode === 'unit' ? 'active' : ''}`}
                  onClick={() => setViewMode('unit')}
                >
                  Unit
                </button>
                <button
                  className={`toggle-btn ${viewMode === 'driver' ? 'active' : ''}`}
                  onClick={() => setViewMode('driver')}
                >
                  Driver
                </button>
              </div>
            )}

            {/* View Mode Toggle */}
            <div className="toggle">
              <button
                className={`toggle-btn ${telematicsView === 'trends' ? 'active' : ''}`}
                onClick={() => setTelematicsView('trends')}
              >
                Monthly Trends
              </button>
              <button
                className={`toggle-btn ${telematicsView === 'breakdown' ? 'active' : ''}`}
                onClick={() => setTelematicsView('breakdown')}
              >
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
            
            {/* Chart Title updates based on selection */}
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
                  <button 
                    onClick={() => setSelectedId(null)}
                    style={{ marginLeft: '1rem', color: 'var(--primary)', border: 'none', background: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    Clear Selection
                  </button>
                </>
              ) : (viewMode === 'unit' && telematicsSelectedUnits.length > 0) || (viewMode === 'driver' && telematicsSelectedDrivers.length > 0) ? (
                (() => {
                  const options = viewMode === 'unit' ? unitOptions : driverOptions;
                  const selected = viewMode === 'unit' ? telematicsSelectedUnits : telematicsSelectedDrivers;
                  const labels = options.filter(o => selected.includes(o.value)).map(o => o.label);
                  
                  // Helper to clear filters
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
                          
                          {/* Dropdown on hover */}
                          <div className="absolute left-0 top-full mt-2 w-[600px] p-0 bg-bg-card border border-border rounded-lg shadow-xl hidden group-hover:block z-50">
                            <div className="sticky top-0 bg-bg-tertiary px-3 py-2 border-b border-border flex justify-between items-center rounded-t-lg">
                              <span className="text-xs font-bold uppercase tracking-wider text-text-secondary">
                                Selected {viewMode === 'unit' ? 'Units' : 'Drivers'} ({labels.length})
                              </span>
                            </div>
                            <div className="p-3 max-h-[400px] overflow-y-auto">
                              <div className="flex flex-wrap gap-2">
                                  {labels.map((label, i) => (
                                    <div key={i} className="px-2 py-1 bg-bg-secondary rounded text-sm border border-border text-text-primary font-normal not-italic">
                                      {label}
                                    </div>
                                  ))}
                              </div>
                            </div>
                          </div>
                        </div>
                        <button 
                          onClick={clearFilters}
                          style={{ marginLeft: '1rem', color: 'var(--primary)', border: 'none', background: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                        >
                          Clear Selection
                        </button>
                      </div>
                    );
                  }
                  
                  return (
                    <div className="flex items-center">
                        <span>Showing: {labels.join(', ')}</span>
                        <button 
                          onClick={clearFilters}
                          style={{ marginLeft: '1rem', color: 'var(--primary)', border: 'none', background: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                        >
                          Clear Selection
                        </button>
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
                {telematicsLoading ? (
                  <Skeleton style={{ height: '100%', borderRadius: 8 }} />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart 
                      data={monthlyMetrics.chartData}
                      margin={{ top: 20, right: 30, left: 30, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis 
                        dataKey="month" 
                        stroke="var(--text-secondary)" 
                        fontSize={12} 
                        tickLine={false}
                        axisLine={false}
                        padding={{ left: 20, right: 20 }}
                      />
                      <YAxis 
                        stroke="var(--text-secondary)" 
                        fontSize={12} 
                        tickLine={false}
                        axisLine={false}
                        domain={['auto', 'auto']}
                        width={40}
                      />
                      <Tooltip 
                        contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '4px' }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="avgMpg" 
                        stroke="#d9a528" 
                        strokeWidth={5} 
                        dot={{ fill: '#d9a528', r: 6, strokeWidth: 0 }} 
                        activeDot={{ r: 8 }}
                      >
                        <LabelList 
                          dataKey="avgMpg" 
                          position="top" 
                          offset={12} 
                          style={{ fill: 'var(--text-secondary)', fontSize: '12px', fontWeight: 700 }} 
                        />
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
                {telematicsLoading ? (
                  <Skeleton style={{ height: '100%', borderRadius: 8 }} />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart 
                      data={monthlyMetrics.chartData}
                      margin={{ top: 20, right: 30, left: 30, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis 
                        dataKey="month" 
                        stroke="var(--text-secondary)" 
                        fontSize={12} 
                        tickLine={false}
                        axisLine={false}
                        padding={{ left: 20, right: 20 }}
                      />
                      <YAxis 
                        stroke="var(--text-secondary)" 
                        fontSize={12} 
                        tickLine={false}
                        axisLine={false}
                        width={40}
                      />
                      <Tooltip 
                        contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '4px' }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="idlePercentage" 
                        stroke="#d9a528" 
                        strokeWidth={5} 
                        dot={{ fill: '#d9a528', r: 6, strokeWidth: 0 }}
                        activeDot={{ r: 8 }}
                      >
                        <LabelList 
                          dataKey="idlePercentage" 
                          position="top" 
                          offset={12} 
                          formatter={(val: any) => `${val}%`}
                          style={{ fill: 'var(--text-secondary)', fontSize: '12px', fontWeight: 700 }} 
                        />
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
                {telematicsLoading ? (
                  <Skeleton style={{ height: '100%', borderRadius: 8 }} />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart 
                      data={monthlyMetrics.chartData}
                      margin={{ top: 20, right: 30, left: 30, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis 
                        dataKey="month" 
                        stroke="var(--text-secondary)" 
                        fontSize={12} 
                        tickLine={false}
                        axisLine={false}
                        padding={{ left: 20, right: 20 }}
                      />
                      <YAxis 
                        stroke="var(--text-secondary)" 
                        fontSize={12} 
                        tickLine={false}
                        axisLine={false}
                        width={40}
                      />
                      <Tooltip 
                        contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '4px' }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="totalMiles" 
                        stroke="#d9a528" 
                        strokeWidth={5} 
                        dot={{ fill: '#d9a528', r: 6, strokeWidth: 0 }}
                        activeDot={{ r: 8 }}
                      >
                        <LabelList 
                          dataKey="totalMiles" 
                          position="top" 
                          offset={12} 
                          formatter={(val) => typeof val === 'number' && val >= 1000 ? `${(val/1000).toFixed(0)}K` : val}
                          style={{ fill: 'var(--text-secondary)', fontSize: '12px', fontWeight: 700 }} 
                        />
                      </Line>
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

          </div>

          {/* RIGHT COLUMN - TABLES */}
          <div className="lg:col-span-4 flex flex-col gap-4 h-full">
            
            {/* Filters (Moved here) */}
            <div className="flex flex-col gap-2">
              {/* Unit / Driver Toggle - Only show if org tracks drivers */}
              {orgSettings.tracksDrivers && (
                <div className="flex gap-2 items-center">
                  <div className="toggle" style={{ height: 'fit-content', flex: 1 }}>
                    <button
                      className={`toggle-btn ${viewMode === 'unit' ? 'active' : ''}`}
                      onClick={() => setViewMode('unit')}
                      style={{ flex: 1 }}
                    >
                      Unit
                    </button>
                    <button
                      className={`toggle-btn ${viewMode === 'driver' ? 'active' : ''}`}
                      onClick={() => setViewMode('driver')}
                      style={{ flex: 1 }}
                    >
                      Driver
                    </button>
                  </div>
                </div>
              )}
              
              {/* Unit/Driver MultiSelect Filter */}
              {viewMode === 'unit' ? (
                <MultiSelect
                  options={unitOptions}
                  selected={telematicsSelectedUnits}
                  onChange={setTelematicsSelectedUnits}
                  placeholder="Filter Units..."
                  className="w-full"
                />
              ) : (
                orgSettings.tracksDrivers && (
                  <MultiSelect
                    options={driverOptions}
                    selected={telematicsSelectedDrivers}
                    onChange={setTelematicsSelectedDrivers}
                    placeholder="Filter Drivers..."
                    className="w-full"
                  />
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
                      <button
                        key={year}
                        onClick={(e) => { e.stopPropagation(); setSelectedTableYear(year); }}
                        className={`text-xs px-2 py-1 rounded ${
                          selectedTableYear === year 
                            ? 'bg-white text-primary font-bold' 
                            : 'bg-white/20 text-white hover:bg-white/30'
                        }`}
                      >
                        {year}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="table-container" style={{ 
                flex: 1, 
                minHeight: '400px',
                overflowY: 'auto',
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
                    {/* Monthly Table Totals */}
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
        <div className="grid lg:grid-cols-12 gap-6 h-[600px]">
          {/* LEFT COLUMN - KPI CARDS */}
          <div className="lg:col-span-3 flex flex-col gap-6 h-full">
            {/* Idle % Card */}
            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4 shadow-sm flex flex-col items-center justify-center flex-1">
              <div className="text-[var(--text-secondary)] text-sm font-medium uppercase tracking-wide mb-2">Idle %</div>
              <div className="text-4xl font-bold text-[var(--warning)]">
                {fleetTotals.idlePercentage}%
              </div>
            </div>

            {/* Idle Fuel Card */}
            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4 shadow-sm flex flex-col items-center justify-center flex-1">
              <div className="text-[var(--text-secondary)] text-sm font-medium uppercase tracking-wide mb-2">Idle Fuel</div>
              <div className="text-4xl font-bold text-[var(--error)]">
                {fleetTotals.totalIdleFuel.toLocaleString()}
              </div>
              <div className="text-xs text-[var(--text-secondary)] mt-1">gallons</div>
            </div>

            {/* Idle Time Card */}
            <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4 shadow-sm flex flex-col items-center justify-center flex-1">
              <div className="text-[var(--text-secondary)] text-sm font-medium uppercase tracking-wide mb-2">Idle Time</div>
              <div className="text-4xl font-bold text-[var(--primary)]">
                {fleetTotals.totalIdleTime.toLocaleString()}
              </div>
              <div className="text-xs text-[var(--text-secondary)] mt-1">minutes</div>
            </div>
          </div>

          {/* RIGHT COLUMN - TABLES */}
          <div className="lg:col-span-9 flex flex-col h-full">
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div style={{ ...chartStyles.bar }}>
                <span>{viewMode === 'unit' ? 'Unit Breakdown' : 'Driver Breakdown'}</span>
              </div>

              <div className="table-container" style={{ 
                flex: 1, 
                height: '100%',
                overflowY: 'auto',
                borderTopLeftRadius: 0,
                borderTopRightRadius: 0,
                borderTop: 'none',
                position: 'relative',
              }}>
              <table className="table w-full table-fixed" style={{ position: 'relative' }}>
                <thead style={{
                  ...tableHeaderStyle,
                  top: -1
                }}>
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
                  {/* Total Row (Top) */}
                  <tr style={{ background: 'var(--primary-dark)', color: 'white', fontWeight: '700' }}>
                    <td style={{ color: 'white' }}>Total</td>
                    <td style={{ color: 'white' }}>{fleetTotals.avgMpg}</td>
                    <td style={{ color: 'white' }}>{fleetTotals.totalMiles.toLocaleString()}</td>
                    <td style={{ color: 'white' }}>{fleetTotals.idlePercentage}%</td>
                    <td style={{ color: 'white' }}>{fleetTotals.totalIdleFuel.toLocaleString()}</td>
                    <td style={{ color: 'white' }}>{fleetTotals.totalIdleTime.toLocaleString()}</td>
                  </tr>

                  {viewMode === 'unit' ? (
                    <>
                      {unitMetrics.map((unit) => (
                        <tr 
                          key={unit.vin} 
                          onClick={() => handleRowClick(unit.vin)}
                          style={{ 
                            cursor: 'pointer',
                            background: selectedId === unit.vin ? 'var(--bg-hover)' : undefined,
                            borderLeft: selectedId === unit.vin ? '4px solid var(--primary)' : undefined
                          }}
                        >
                          <td style={{ fontWeight: '600' }}>{unit.unitNumber}</td>
                          <td>{unit.avgMpg}</td>
                          <td>{Math.round(unit.totalMiles).toLocaleString()}</td>
                          <td style={{ fontWeight: '600' }}>{unit.idlePercentage}%</td>
                          <td>{unit.idleFuel.toLocaleString()}</td>
                          <td>{unit.idleTimeMinutes.toLocaleString()}</td>
                        </tr>
                      ))}
                    </>
                  ) : (
                    <>
                      {driverMetrics.map((driver) => (
                        <tr 
                          key={driver.driverId}
                          onClick={() => handleRowClick(driver.driverId)}
                          style={{ 
                            cursor: 'pointer',
                            background: selectedId === driver.driverId ? 'var(--bg-hover)' : undefined,
                            borderLeft: selectedId === driver.driverId ? '4px solid var(--primary)' : undefined
                          }}
                        >
                          <td style={{ fontWeight: '600' }}>{driver.driverName}</td>
                          <td>{driver.avgMpg}</td>
                          <td>{Math.round(driver.totalMiles).toLocaleString()}</td>
                          <td style={{ fontWeight: '600' }}>{driver.idlePercentage}%</td>
                          <td>{driver.idleFuel.toLocaleString()}</td>
                          <td>{driver.idleTimeMinutes.toLocaleString()}</td>
                        </tr>
                      ))}
                    </>
                  )}
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
