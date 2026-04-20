'use client';

import { useState, useTransition } from 'react';
import { useOrganization } from '@clerk/nextjs';
import { DateRangePicker } from '@/components/DateRangePicker';
import { KpiCard, SkeletonKpiCard } from '@/components/KpiCard';
import { Loader2 } from 'lucide-react';
import { RepairBreakdown } from '@/features/fleet/components/RepairBreakdown';
import { TelematicsTrendsView } from '@/features/fleet/components/TelematicsTrendsView';
import { TelematicsBreakdownView } from '@/features/fleet/components/TelematicsBreakdownView';
import { useFleetData } from '@/features/fleet/hooks/useFleetData';

function formatDateLabel(start: string, end: string): string {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const startOfYear = `${today.getFullYear()}-01-01`;

  if (start === startOfYear && end === todayStr) return 'This Year';

  const startDate = new Date(start + 'T00:00:00');
  const endDate = new Date(end + 'T00:00:00');
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
  return `${startDate.toLocaleDateString('en-US', opts)} – ${endDate.toLocaleDateString('en-US', opts)}`;
}

export default function FleetOverviewPage() {
  const { organization } = useOrganization();
  const fleet = useFleetData();
  const [repairSelectedUnit, setRepairSelectedUnit] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const dateLabel = formatDateLabel(fleet.startDate, fleet.endDate);

  return (
    <div className="w-full">
      {/* Sticky Page Header */}
      <div className="sticky top-0 z-20 bg-background border-b border-border px-6 py-3">
        <div className="flex items-center justify-between gap-4">
          {/* Left: title */}
          <div className="shrink-0">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold leading-none">Fleet Overview</h1>
              {fleet.isRefetching && (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Updating...
                </span>
              )}
            </div>
            <p className="text-muted-foreground text-sm mt-0.5">{organization?.name}</p>
          </div>

          {/* Right: date picker */}
          <div className="shrink-0">
            <DateRangePicker
              startDate={fleet.startDate}
              endDate={fleet.endDate}
              onStartDateChange={fleet.setStartDate}
              onEndDateChange={fleet.setEndDate}
              minDate={fleet.earliestDataDate}
            />
          </div>
        </div>
      </div>

      <div className="px-6 pt-4 pb-6">

      {fleet.orgSettingsError && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-800 dark:text-amber-200 text-sm flex items-center justify-between gap-4">
          <span>Settings could not be loaded: {fleet.orgSettingsError} Showing default options.</span>
          <button
            type="button"
            onClick={() => fleet.setOrgErrorDismissed(true)}
            className="shrink-0 px-2 py-1 rounded hover:bg-amber-500/20 transition-colors"
            aria-label="Dismiss"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Fleet Totals Header + KPI Grid */}
      <div className="mb-6">
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Fleet Totals</h2>
          <p className="text-xs text-muted-foreground">{dateLabel}</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {(fleet.telematicsLoading || fleet.repairsLoading) ? (
            Array.from({ length: 10 }).map((_, i) => <SkeletonKpiCard key={i} />)
          ) : (
            <>
              <KpiCard label="Total Fleet Miles" value={fleet.fleetKpis.totalMiles.toLocaleString()} subtext="miles" />
              <KpiCard label="Fleet Avg MPG" value={fleet.fleetKpis.avgMpg} />
              <KpiCard label="Idle %" value={`${fleet.fleetKpis.idlePct}%`} variant="warning" />
              <KpiCard label="Idle Fuel" value={fleet.fleetKpis.idleFuel.toLocaleString()} subtext="gallons" variant="warning" />
              <KpiCard label="Total Fuel" value={fleet.fleetKpis.totalFuel.toLocaleString()} subtext="gallons" />
              <KpiCard label="Driving Fuel" value={fleet.fleetKpis.drivingFuel.toLocaleString()} subtext="gallons" />
              <KpiCard
                label="Idle Fuel Cost"
                value={`$${fleet.fleetKpis.estimatedIdleFuelCost.toLocaleString()}`}
                subtext={`@ $${(fleet.orgSettings.dieselPricePerGallon ?? 3.85).toFixed(2)}/gal (EIA Midwest)`}
                variant="warning"
              />
<KpiCard label="Total Repair Jobs" value={fleet.repairKpis.totalJobs} />
              <KpiCard
                label="Jobs with Damage"
                value={fleet.repairKpis.damageJobs}
                variant={fleet.repairKpis.damageJobs > 0 ? 'error' : 'default'}
              />
            </>
          )}
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex justify-between items-end border-b border-border mb-6">
        <div className="flex gap-1">
          <button
            className={`px-4 py-2 text-sm font-medium transition-colors cursor-pointer ${
              fleet.activeTab === 'telematics'
                ? 'text-primary border-b-[3px] border-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => startTransition(() => fleet.setActiveTab('telematics'))}
            >
              Telematics
            </button>
          <button
            className={`px-4 py-2 text-sm font-medium transition-colors cursor-pointer ${
              fleet.activeTab === 'repairs'
                ? 'text-primary border-b-[3px] border-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => startTransition(() => fleet.setActiveTab('repairs'))}
          >
            Repair Data
          </button>
        </div>
        {fleet.activeTab === 'telematics' && (
          <div className="flex items-center gap-2 mb-2">
            <div className="flex rounded-lg border border-border overflow-hidden">
              {(['overview', 'units', 'drivers'] as const).map((tab) => {
                if (tab === 'drivers' && !fleet.orgSettings.tracksDrivers) return null;
                const labels = { overview: 'Fleet Overview', units: 'Units', drivers: 'Drivers' };
                return (
                  <button
                    key={tab}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer border-l first:border-l-0 border-border ${
                      fleet.telematicsView === tab ? 'bg-primary text-primary-foreground' : 'text-muted-foreground bg-transparent hover:bg-accent'
                    }`}
                    onClick={() => startTransition(() => {
                      fleet.setTelematicsView(tab);
                      fleet.setViewMode(tab === 'drivers' ? 'driver' : 'unit');
                    })}
                  >
                    {labels[tab]}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Tab Content */}
      {fleet.activeTab === 'repairs' ? (
        <RepairBreakdown
          units={fleet.repairUnits}
          loading={fleet.repairsLoading}
          error={fleet.repairsError}
          startDate={fleet.startDate}
          endDate={fleet.endDate}
          onUnitSelect={setRepairSelectedUnit}
        />
      ) : fleet.telematicsView === 'overview' ? (
        <TelematicsTrendsView
          loading={fleet.telematicsLoading}
          monthlyMetrics={fleet.monthlyMetrics}
          fleetTotals={fleet.fleetTotals}
          showYearToggle={fleet.showYearToggle}
          availableYears={fleet.availableYears}
          selectedTableYear={fleet.selectedTableYear}
          onTableYearChange={fleet.setSelectedTableYear}
        />
      ) : fleet.telematicsView === 'drivers' ? (
        <TelematicsBreakdownView
          loading={fleet.telematicsLoading}
          viewMode="driver"
          tracksDrivers={fleet.orgSettings.tracksDrivers}
          unitMetrics={fleet.unitMetrics}
          driverMetrics={fleet.driverMetrics}
          fleetTotals={fleet.fleetTotals}
          selectedId={fleet.selectedId}
          onRowClick={id => startTransition(() => fleet.setSelectedId(fleet.selectedId === id ? null : id))}
        />
      ) : (
        <TelematicsBreakdownView
          loading={fleet.telematicsLoading}
          viewMode="unit"
          tracksDrivers={fleet.orgSettings.tracksDrivers}
          unitMetrics={fleet.unitMetrics}
          driverMetrics={fleet.driverMetrics}
          fleetTotals={fleet.fleetTotals}
          selectedId={fleet.selectedId}
          onRowClick={id => startTransition(() => fleet.setSelectedId(fleet.selectedId === id ? null : id))}
        />
      )}
      </div>
    </div>
  );
}
