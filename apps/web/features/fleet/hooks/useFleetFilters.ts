import { useState, useEffect } from 'react';
import { useOrgSettingsQuery, useRepairsQuery } from '@/hooks/useDataQueries';

function todayStr() {
  return new Date().toISOString().split('T')[0];
}
function twelveMonthsAgoStr() {
  const d = new Date();
  d.setMonth(d.getMonth() - 12);
  return d.toISOString().split('T')[0];
}

export function useFleetFilters() {
  const orgSettingsQuery = useOrgSettingsQuery();
  const repairsQuery = useRepairsQuery();

  const [activeTab, setActiveTab] = useState<'telematics' | 'repairs'>('telematics');
  const [viewMode, setViewMode] = useState<'unit' | 'driver'>('unit');
  const [selectedId, setSelectedId] = useState<string | number | null>(null);
  const [telematicsView, setTelematicsView] = useState<'trends' | 'breakdown'>('trends');

  const [telematicsSelectedUnits, setTelematicsSelectedUnits] = useState<string[]>([]);
  const [telematicsSelectedDrivers, setTelematicsSelectedDrivers] = useState<string[]>([]);

  const [startDate, setStartDate] = useState(twelveMonthsAgoStr);
  const [endDate, setEndDate] = useState(todayStr);
  const [repairStartDate, setRepairStartDate] = useState(twelveMonthsAgoStr);
  const [repairEndDate, setRepairEndDate] = useState(todayStr);
  const [selectedTableYear, setSelectedTableYear] = useState(new Date().getFullYear());
  const [orgErrorDismissed, setOrgErrorDismissed] = useState(false);

  // Sync start dates from server data
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

  // Guard: reset to unit mode if driver tracking disabled
  useEffect(() => {
    if (orgSettingsQuery.data && !orgSettingsQuery.data.tracksDrivers && viewMode === 'driver') {
      setViewMode('unit');
    }
  }, [orgSettingsQuery.data, viewMode]);

  // Guard: clamp selectedTableYear to date range
  useEffect(() => {
    const startYear = new Date(startDate).getFullYear();
    const endYear = new Date(endDate).getFullYear();
    if (selectedTableYear < startYear || selectedTableYear > endYear) {
      setSelectedTableYear(endYear);
    }
  }, [startDate, endDate, selectedTableYear]);

  // Clear selection when switching view modes
  useEffect(() => {
    setSelectedId(null);
  }, [viewMode]);

  return {
    activeTab, setActiveTab,
    viewMode, setViewMode,
    selectedId, setSelectedId,
    telematicsView, setTelematicsView,
    telematicsSelectedUnits, setTelematicsSelectedUnits,
    telematicsSelectedDrivers, setTelematicsSelectedDrivers,
    startDate, setStartDate,
    endDate, setEndDate,
    repairStartDate, setRepairStartDate,
    repairEndDate, setRepairEndDate,
    selectedTableYear, setSelectedTableYear,
    orgErrorDismissed, setOrgErrorDismissed,
  };
}
