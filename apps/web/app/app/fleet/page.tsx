'use client';

import { useOrganization } from '@clerk/nextjs';
import { DateRangePicker } from '@/components/DateRangePicker';
import { KpiCard } from '@/components/KpiCard';
import { RepairBreakdown } from '@/features/fleet/components/RepairBreakdown';
import { TelematicsTrendsView } from '@/features/fleet/components/TelematicsTrendsView';
import { TelematicsBreakdownView } from '@/features/fleet/components/TelematicsBreakdownView';
import { useFleetData } from '@/features/fleet/hooks/useFleetData';

export default function FleetOverviewPage() {
  const { organization } = useOrganization();
  const fleet = useFleetData();

  return (
    <div className="w-full p-6">
      {/* Page Header */}
      <div className="flex justify-between items-center gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold mb-1">Fleet Overview</h1>
          <p className="text-muted-foreground text-sm">{organization?.name}</p>
        </div>
        <DateRangePicker
          startDate={fleet.activeTab === 'telematics' ? fleet.startDate : fleet.repairStartDate}
          endDate={fleet.activeTab === 'telematics' ? fleet.endDate : fleet.repairEndDate}
          onStartDateChange={fleet.activeTab === 'telematics' ? fleet.setStartDate : fleet.setRepairStartDate}
          onEndDateChange={fleet.activeTab === 'telematics' ? fleet.setEndDate : fleet.setRepairEndDate}
        />
      </div>

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

      {/* KPI Bar */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        <KpiCard label="Total Fleet Miles" value={fleet.telematicsLoading ? '—' : fleet.fleetKpis.totalMiles.toLocaleString()} subtext="miles" />
        <KpiCard label="Fleet Avg MPG" value={fleet.telematicsLoading ? '—' : fleet.fleetKpis.avgMpg} />
        <KpiCard
          label="Idle %"
          value={fleet.telematicsLoading ? '—' : `${fleet.fleetKpis.idlePct}%`}
          variant={!fleet.telematicsLoading && parseFloat(fleet.fleetKpis.idlePct) > 30 ? 'warning' : 'default'}
        />
        <KpiCard label="Idle Fuel" value={fleet.telematicsLoading ? '—' : fleet.fleetKpis.idleFuel.toLocaleString()} subtext="gallons" />
        <KpiCard label="Total Fuel" value={fleet.telematicsLoading ? '—' : fleet.fleetKpis.totalFuel.toLocaleString()} subtext="gallons" />
        <KpiCard label="Driving Fuel" value={fleet.telematicsLoading ? '—' : fleet.fleetKpis.drivingFuel.toLocaleString()} subtext="gallons" />
        <KpiCard label="Est. Fuel Cost" value={fleet.telematicsLoading ? '—' : `$${fleet.fleetKpis.estimatedFuelCost.toLocaleString()}`} />
        <KpiCard
          label="Est. Idle Fuel Cost"
          value={fleet.telematicsLoading ? '—' : `$${fleet.fleetKpis.estimatedIdleFuelCost.toLocaleString()}`}
          variant={!fleet.telematicsLoading && fleet.fleetKpis.estimatedIdleFuelCost > 500 ? 'warning' : 'default'}
        />
        <KpiCard label="Total Repair Jobs" value={fleet.repairsLoading ? '—' : fleet.repairKpis.totalJobs} />
        <KpiCard
          label="Jobs with Damage"
          value={fleet.repairsLoading ? '—' : fleet.repairKpis.damageJobs}
          variant={!fleet.repairsLoading && fleet.repairKpis.damageJobs > 0 ? 'warning' : 'default'}
        />
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
            onClick={() => fleet.setActiveTab('telematics')}
          >
            Telematics
          </button>
          <button
            className={`px-4 py-2 text-sm font-medium transition-colors cursor-pointer ${
              fleet.activeTab === 'repairs'
                ? 'text-primary border-b-[3px] border-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => fleet.setActiveTab('repairs')}
          >
            Repair Data
          </button>
        </div>
        {fleet.activeTab === 'telematics' && (
          <div className="flex items-center gap-4 mb-2">
            {fleet.orgSettings.tracksDrivers && (
              <div className="flex rounded-lg border border-border overflow-hidden">
                <button
                  className={`px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                    fleet.viewMode === 'unit' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground bg-transparent'
                  }`}
                  onClick={() => fleet.setViewMode('unit')}
                >
                  Unit
                </button>
                <button
                  className={`px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                    fleet.viewMode === 'driver' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground bg-transparent'
                  }`}
                  onClick={() => fleet.setViewMode('driver')}
                >
                  Driver
                </button>
              </div>
            )}
            <div className="flex rounded-lg border border-border overflow-hidden">
              <button
                className={`px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                  fleet.telematicsView === 'trends' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground bg-transparent'
                }`}
                onClick={() => fleet.setTelematicsView('trends')}
              >
                Monthly Trends
              </button>
              <button
                className={`px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                  fleet.telematicsView === 'breakdown' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground bg-transparent'
                }`}
                onClick={() => fleet.setTelematicsView('breakdown')}
              >
                {fleet.viewMode === 'unit' ? 'Unit Breakdown' : 'Driver Breakdown'}
              </button>
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
          startDate={fleet.repairStartDate}
          endDate={fleet.repairEndDate}
        />
      ) : fleet.telematicsView === 'trends' ? (
        <TelematicsTrendsView
          loading={fleet.telematicsLoading}
          viewMode={fleet.viewMode}
          onViewModeChange={fleet.setViewMode}
          tracksDrivers={fleet.orgSettings.tracksDrivers}
          selectedId={fleet.selectedId}
          onSelectedIdChange={fleet.setSelectedId}
          unitMetrics={fleet.unitMetrics}
          driverMetrics={fleet.driverMetrics}
          unitOptions={fleet.unitOptions}
          driverOptions={fleet.driverOptions}
          selectedUnits={fleet.telematicsSelectedUnits}
          selectedDrivers={fleet.telematicsSelectedDrivers}
          onUnitsChange={fleet.setTelematicsSelectedUnits}
          onDriversChange={fleet.setTelematicsSelectedDrivers}
          monthlyMetrics={fleet.monthlyMetrics}
          fleetTotals={fleet.fleetTotals}
          showYearToggle={fleet.showYearToggle}
          availableYears={fleet.availableYears}
          selectedTableYear={fleet.selectedTableYear}
          onTableYearChange={fleet.setSelectedTableYear}
        />
      ) : (
        <TelematicsBreakdownView
          viewMode={fleet.viewMode}
          onViewModeChange={fleet.setViewMode}
          tracksDrivers={fleet.orgSettings.tracksDrivers}
          unitMetrics={fleet.unitMetrics}
          driverMetrics={fleet.driverMetrics}
          fleetTotals={fleet.fleetTotals}
          selectedId={fleet.selectedId}
          onRowClick={id => fleet.setSelectedId(fleet.selectedId === id ? null : id)}
          showDriverScorecard={fleet.orgSettings.tracksDrivers}
        />
      )}
    </div>
  );
}
