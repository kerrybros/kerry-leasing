'use client';

import { useAuth, useOrganization } from '@clerk/nextjs';
import { useEffect, useState } from 'react';
import { createApiClient } from '@/lib/api';

interface ServicePlanUnit {
  id: string;
  repairUnitId: string;
  repairUnitNumber: string | null;
  repairVin: string | null;
  telematicsVin: string | null;
  matchType: 'AUTO' | 'MANUAL' | 'UNMATCHED';
  matchConfidence: number | null;
  isIncluded: boolean;
  notes: string | null;
  telematicsData?: {
    vehicleNumber: string;
    lastDataDate: string;
    hasTelematicsData: boolean;
  } | null;
}

interface UnitsSummary {
  total: number;
  matched: number;
  unmatched: number;
  included: number;
  excluded: number;
  fromRepair: number;
  fromTelematicsOnly: number;
  withTelematicsData: number;
}

export default function AdminServicePlanPage() {
  const { getToken } = useAuth();
  const { organization } = useOrganization();
  const [units, setUnits] = useState<ServicePlanUnit[]>([]);
  const [summary, setSummary] = useState<UnitsSummary | null>(null);
  const [telematicsProvider, setTelematicsProvider] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncSuccess, setSyncSuccess] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'included' | 'excluded' | 'unmatched'>('all');

  const loadUnits = async () => {
    try {
      setLoading(true);
      setError(null);

      const token = await getToken();
      const headers: Record<string, string> = {};
      if (organization?.id) {
        headers['x-organization-id'] = organization.id;
      }
      const api = createApiClient(token, headers);

      const data = await api.get<{ units: ServicePlanUnit[]; summary: UnitsSummary }>('/admin/service-plan/units');

      setUnits(data.units);
      setSummary(data.summary);
      
      // Also load org settings to get provider
      const settings = await api.get<{ telematicsProvider: string | null }>('/org/settings');
      setTelematicsProvider(settings.telematicsProvider);
    } catch (err: any) {
      setError(err.message || 'Failed to load units');
      console.error('Error loading units:', err);
    } finally {
      setLoading(false);
    }
  };

  const syncUnits = async () => {
    try {
      setSyncing(true);
      setError(null);
      setSyncSuccess(null);

      const token = await getToken();
      const headers: Record<string, string> = {};
      if (organization?.id) {
        headers['x-organization-id'] = organization.id;
      }
      const api = createApiClient(token, headers);

      const data = await api.post<{
        success: boolean;
        synced: number;
        autoMatched: number;
        newRepairUnits: number;
        newTelematicsUnits: number;
        updatedUnits: number;
        summary: {
          totalUnits: number;
          fromRepair: number;
          fromTelematics: number;
          matchedUnits: number;
        };
      }>('/admin/service-plan/sync', {});

      console.log('Sync result:', data);

      // Show success message
      setSyncSuccess(
        `✅ Synced ${data.synced} units: ${data.summary.fromRepair} from repair DB, ${data.summary.fromTelematics} from telematics. ${data.autoMatched} auto-matched.`
      );

      // Reload units after sync
      await loadUnits();
    } catch (err: any) {
      setError(err.message || 'Failed to sync units');
      console.error('Error syncing units:', err);
    } finally {
      setSyncing(false);
    }
  };

  const toggleInclusion = async (unitId: string, currentIsIncluded: boolean) => {
    try {
      const token = await getToken();
      const headers: Record<string, string> = {};
      if (organization?.id) {
        headers['x-organization-id'] = organization.id;
      }
      const api = createApiClient(token, headers);

      await api.put(`/admin/service-plan/units/${unitId}/inclusion`, {
        isIncluded: !currentIsIncluded
      });

      // Update local state
      setUnits(prev =>
        prev.map(u =>
          u.repairUnitId === unitId ? { ...u, isIncluded: !currentIsIncluded } : u
        )
      );

      // Update summary
      if (summary) {
        setSummary({
          ...summary,
          included: currentIsIncluded ? summary.included - 1 : summary.included + 1,
          excluded: currentIsIncluded ? summary.excluded + 1 : summary.excluded - 1,
        });
      }
    } catch (err: any) {
      setError(err.message || 'Failed to update unit');
      console.error('Error updating unit:', err);
    }
  };

  useEffect(() => {
    if (organization?.id) {
      loadUnits();
    }
  }, [organization?.id]);

  const filteredUnits = units.filter(unit => {
    if (filter === 'included') return unit.isIncluded;
    if (filter === 'excluded') return !unit.isIncluded;
    if (filter === 'unmatched') return unit.matchType === 'UNMATCHED';
    return true;
  });

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">Loading service plan units...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Manage Service Plan</h1>
        <p className="text-text-secondary">
          Configure which units are included in the service plan for{' '}
          <span className="font-semibold">{organization?.name}</span>
          {telematicsProvider && (
            <span className="ml-2 text-sm px-2 py-1 bg-blue-100 text-blue-800 rounded">
              {telematicsProvider === 'MOTIVE' ? '📡 Motive' : '🛰️ Samsara'}
            </span>
          )}
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
          <strong>Error:</strong> {error}
        </div>
      )}

      {syncSuccess && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800">
          {syncSuccess}
        </div>
      )}

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-bg-secondary border border-border rounded-lg p-4">
            <div className="text-2xl font-bold text-primary">{summary.total}</div>
            <div className="text-sm text-text-secondary">Total Units</div>
          </div>
          <div className="bg-bg-secondary border border-border rounded-lg p-4">
            <div className="text-2xl font-bold text-green-600">{summary.included}</div>
            <div className="text-sm text-text-secondary">Included</div>
          </div>
          <div className="bg-bg-secondary border border-border rounded-lg p-4">
            <div className="text-2xl font-bold text-yellow-600">{summary.excluded}</div>
            <div className="text-sm text-text-secondary">Excluded</div>
          </div>
          <div className="bg-bg-secondary border border-border rounded-lg p-4">
            <div className="text-2xl font-bold text-blue-600">{summary.matched}</div>
            <div className="text-sm text-text-secondary">Matched</div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="mb-6">
        <div className="flex flex-wrap gap-4 items-center mb-2">
          <button
            onClick={syncUnits}
            disabled={syncing}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark disabled:opacity-50 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {syncing ? 'Syncing...' : 'Refresh Units'}
          </button>

          <div className="flex gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1 rounded ${
                filter === 'all'
                  ? 'bg-primary text-white'
                  : 'bg-bg-tertiary text-text-primary hover:bg-bg-hover'
              }`}
            >
              All ({units.length})
            </button>
            <button
              onClick={() => setFilter('included')}
              className={`px-3 py-1 rounded ${
                filter === 'included'
                  ? 'bg-primary text-white'
                  : 'bg-bg-tertiary text-text-primary hover:bg-bg-hover'
              }`}
            >
              Included ({summary?.included || 0})
            </button>
            <button
              onClick={() => setFilter('excluded')}
              className={`px-3 py-1 rounded ${
                filter === 'excluded'
                  ? 'bg-primary text-white'
                  : 'bg-bg-tertiary text-text-primary hover:bg-bg-hover'
              }`}
            >
              Excluded ({summary?.excluded || 0})
            </button>
            <button
              onClick={() => setFilter('unmatched')}
              className={`px-3 py-1 rounded ${
                filter === 'unmatched'
                  ? 'bg-primary text-white'
                  : 'bg-bg-tertiary text-text-primary hover:bg-bg-hover'
              }`}
            >
              Unmatched ({summary?.unmatched || 0})
            </button>
          </div>
        </div>
        
        <div className="text-sm text-text-secondary italic ml-auto">
          💡 Refresh syncs units from both repair database and telematics data
        </div>
      </div>

      {/* Units Table */}
      <div className="bg-bg-secondary border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-bg-tertiary border-b border-border">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold">Unit Number</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Repair VIN</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Telematics VIN</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Match Status</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Included</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredUnits.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-text-secondary">
                    No units found. Click "Sync Units" to import from repair database.
                  </td>
                </tr>
              ) : (
                filteredUnits.map(unit => (
                  <tr key={unit.id} className="hover:bg-bg-hover">
                    <td className="px-4 py-3 text-sm">
                      {unit.repairUnitNumber || <span className="text-text-secondary italic">N/A</span>}
                    </td>
                    <td className="px-4 py-3 text-sm font-mono text-xs">
                      {unit.repairVin || <span className="text-text-secondary italic">N/A</span>}
                    </td>
                    <td className="px-4 py-3 text-sm font-mono text-xs">
                      {unit.telematicsVin || <span className="text-text-secondary italic">N/A</span>}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${
                          unit.matchType === 'AUTO'
                            ? 'bg-green-100 text-green-800'
                            : unit.matchType === 'MANUAL'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}
                      >
                        {unit.matchType}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${
                          unit.isIncluded
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {unit.isIncluded ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <button
                        onClick={() => toggleInclusion(unit.repairUnitId, unit.isIncluded)}
                        className={`px-3 py-1 rounded text-xs ${
                          unit.isIncluded
                            ? 'bg-red-100 text-red-800 hover:bg-red-200'
                            : 'bg-green-100 text-green-800 hover:bg-green-200'
                        }`}
                      >
                        {unit.isIncluded ? 'Exclude' : 'Include'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
