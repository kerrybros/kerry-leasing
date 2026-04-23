import { useState, useEffect } from 'react';
import { useOrgSettingsQuery, type UnitType } from '@/hooks/useDataQueries';

function todayStr() {
  return new Date().toISOString().split('T')[0];
}
function startOfYearStr() {
  return `${new Date().getFullYear()}-01-01`;
}

export function useFleetFilters() {
  const orgSettingsQuery = useOrgSettingsQuery();

  const [activeTab, setActiveTab] = useState<'telematics' | 'repairs'>('telematics');
  const [telematicsView, setTelematicsView] = useState<'overview' | 'units' | 'drivers'>('overview');
  const [viewMode, setViewMode] = useState<'unit' | 'driver'>('unit');
  const [selectedId, setSelectedId] = useState<string | number | null>(null);
  // Single shared date range for both telematics and repairs — default to This Year
  const [startDate, setStartDate] = useState(startOfYearStr);
  const [endDate, setEndDate] = useState(todayStr);
  const [selectedTableYear, setSelectedTableYear] = useState(new Date().getFullYear());
  const [orgErrorDismissed, setOrgErrorDismissed] = useState(false);
  const [selectedUnitTypes, setSelectedUnitTypes] = useState<UnitType[]>([]);

  // Guard: reset to unit mode if driver tracking disabled
  useEffect(() => {
    if (orgSettingsQuery.data && !orgSettingsQuery.data.tracksDrivers && viewMode === 'driver') {
      setViewMode('unit');
    }
  }, [orgSettingsQuery.data, viewMode]);

  // Keep selectedTableYear in sync with the end of the selected date range
  useEffect(() => {
    const year = new Date(endDate).getFullYear();
    setSelectedTableYear(year);
  }, [endDate]);

  // selectedTableYear is no longer clamped to the date range —
  // the monthly table shows full-year data independent of the date picker.

  // Clear selection when switching view modes
  useEffect(() => {
    setSelectedId(null);
  }, [viewMode]);

  return {
    activeTab, setActiveTab,
    telematicsView, setTelematicsView,
    viewMode, setViewMode,
    selectedId, setSelectedId,
    startDate, setStartDate,
    endDate, setEndDate,
    selectedTableYear, setSelectedTableYear,
    orgErrorDismissed, setOrgErrorDismissed,
    selectedUnitTypes, setSelectedUnitTypes,
  };
}
