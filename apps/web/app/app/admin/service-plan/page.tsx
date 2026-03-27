'use client';

import { useOrganization } from '@clerk/nextjs';
import { useCallback, useEffect, useState } from 'react';
import { useApiClient } from '@/hooks/useApiClient';
import { KpiCard } from '@/components/KpiCard';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/Skeleton';

interface ServicePlanUnit {
  id: string;
  repairUnitId: string;
  repairUnitNumber: string | null;
  repairVin: string | null;
  telematicsVin: string | null;
  matchType: 'AUTO' | 'MANUAL' | 'UNMATCHED';
  matchConfidence: number | null;
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
  fromRepair: number;
  fromTelematicsOnly: number;
  withTelematicsData: number;
}

interface Toast {
  id: number;
  type: 'success' | 'error';
  message: string;
}

let toastId = 0;

function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const add = (type: 'success' | 'error', message: string) => {
    const id = ++toastId;
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000);
  };
  return { toasts, addToast: add };
}

export default function AdminServicePlanPage() {
  const { getApi } = useApiClient();
  const { organization } = useOrganization();
  const { toasts, addToast } = useToasts();

  const [units, setUnits] = useState<ServicePlanUnit[]>([]);
  const [summary, setSummary] = useState<UnitsSummary | null>(null);
  const [telematicsProvider, setTelematicsProvider] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unmatched'>('all');

  // Available VINs for inline matching
  const [availableVins, setAvailableVins] = useState<string[]>([]);
  const [matchingUnitId, setMatchingUnitId] = useState<string | null>(null);
  const [matchingVin, setMatchingVin] = useState('');
  const [matchingInProgress, setMatchingInProgress] = useState(false);
  const [unmatchingId, setUnmatchingId] = useState<string | null>(null);

  const loadUnits = useCallback(async () => {
    try {
      setLoading(true);
      const api = await getApi();
      const [data, settings] = await Promise.all([
        api.get<{ units: ServicePlanUnit[]; summary: UnitsSummary }>('/admin/service-plan/units'),
        api.get<{ telematicsProvider: string | null }>('/org/settings'),
      ]);
      setUnits(data.units);
      setSummary(data.summary);
      setTelematicsProvider(settings.telematicsProvider);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load units';
      addToast('error', msg);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getApi]);

  const syncUnits = async () => {
    try {
      setSyncing(true);
      const api = await getApi();
      const data = await api.post<{
        success: boolean; synced: number; autoMatched: number;
        summary: { totalUnits: number; fromRepair: number; fromTelematics: number; matchedUnits: number };
      }>('/admin/service-plan/sync', {});
      addToast('success', `Synced ${data.synced} units. ${data.autoMatched} auto-matched.`);
      await loadUnits();
    } catch (err: unknown) {
      addToast('error', err instanceof Error ? err.message : 'Failed to sync units');
    } finally {
      setSyncing(false);
    }
  };

  const loadAvailableVins = async () => {
    try {
      const api = await getApi();
      const data = await api.get<{ vins: string[] }>('/admin/service-plan/available-vins');
      setAvailableVins(data.vins ?? []);
    } catch {
      setAvailableVins([]);
    }
  };

  const startMatching = (unitId: string) => {
    setMatchingUnitId(unitId);
    setMatchingVin('');
    if (availableVins.length === 0) loadAvailableVins();
  };

  const confirmMatch = async (unitId: string) => {
    if (!matchingVin) return;
    try {
      setMatchingInProgress(true);
      const api = await getApi();
      await api.put(`/admin/service-plan/units/${unitId}/match`, { telematicsVin: matchingVin });
      addToast('success', 'Unit matched successfully.');
      setMatchingUnitId(null);
      await loadUnits();
    } catch (err: unknown) {
      addToast('error', err instanceof Error ? err.message : 'Failed to match unit');
    } finally {
      setMatchingInProgress(false);
    }
  };

  const unmatchUnit = async (unitId: string) => {
    try {
      setUnmatchingId(unitId);
      const api = await getApi();
      await (api as unknown as { delete: (url: string) => Promise<unknown> }).delete(`/admin/service-plan/units/${unitId}/match`);
      addToast('success', 'Unit unmatched.');
      await loadUnits();
    } catch (err: unknown) {
      addToast('error', err instanceof Error ? err.message : 'Failed to unmatch unit');
    } finally {
      setUnmatchingId(null);
    }
  };

  useEffect(() => {
    if (organization?.id) loadUnits();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organization?.id]);

  const autoCount = units.filter(u => u.matchType === 'AUTO').length;
  const manualCount = units.filter(u => u.matchType === 'MANUAL').length;
  const unmatchedCount = summary?.unmatched ?? 0;

  const filteredUnits = units.filter(unit => {
    if (filter === 'unmatched') return unit.matchType === 'UNMATCHED';
    return true;
  });

  const matchTypeBadge = (type: 'AUTO' | 'MANUAL' | 'UNMATCHED') => {
    if (type === 'AUTO') return (
      <span className="px-2 py-0.5 rounded text-xs font-semibold bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 border border-green-200 dark:border-green-800">
        Auto
      </span>
    );
    if (type === 'MANUAL') return (
      <span className="px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
        Manual
      </span>
    );
    return (
      <span className="px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
        Unmatched
      </span>
    );
  };

  return (
    <div className="container mx-auto px-4 py-8" style={{ maxWidth: '1400px' }}>
      {/* Toast notifications */}
      {toasts.length > 0 && (
        <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full">
          {toasts.map(t => (
            <div key={t.id} className={`px-4 py-3 rounded-lg border text-sm font-medium shadow-lg ${
              t.type === 'success'
                ? 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/30 dark:border-green-800 dark:text-green-300'
                : 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/30 dark:border-red-800 dark:text-red-300'
            }`}>
              {t.message}
            </div>
          ))}
        </div>
      )}

      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-1">Service Plan</h1>
        <p className="text-text-secondary text-sm">
          Manage unit matching for{' '}
          <span className="font-semibold">{organization?.name}</span>
          {telematicsProvider && (
            <span className="ml-2 px-2 py-0.5 rounded text-xs bg-bg-secondary border border-border text-text-secondary">
              {telematicsProvider}
            </span>
          )}
        </p>
      </div>

      {loading ? (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1,2,3,4].map(i => <Skeleton key={i} style={{ height: 80, borderRadius: 8 }} />)}
          </div>
          <Skeleton style={{ height: 400, borderRadius: 8 }} />
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <KpiCard label="Total Units" value={summary?.total ?? 0} />
            <KpiCard label="Auto-Matched" value={autoCount} variant="success" />
            <KpiCard label="Manually Matched" value={manualCount} />
            <KpiCard
              label="Unmatched"
              value={unmatchedCount}
              variant={unmatchedCount > 0 ? 'warning' : 'default'}
            />
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-3 items-center mb-4">
            <button
              onClick={syncUnits}
              disabled={syncing}
              className="btn btn-primary flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {syncing ? 'Syncing...' : 'Refresh Units'}
            </button>

            <div className="flex gap-2">
              <button
                onClick={() => setFilter('all')}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  filter === 'all' ? 'bg-primary text-white' : 'bg-bg-secondary border border-border text-text-primary hover:bg-bg-hover'
                }`}
              >
                All ({units.length})
              </button>
              <button
                onClick={() => setFilter('unmatched')}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  filter === 'unmatched' ? 'bg-primary text-white' : 'bg-bg-secondary border border-border text-text-primary hover:bg-bg-hover'
                }`}
              >
                Unmatched ({unmatchedCount})
              </button>
            </div>
          </div>

          {/* Units Table */}
          <div className="bg-bg-card border border-border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-bg-tertiary border-b border-border">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-text-primary">Unit Number</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-text-primary">Repair VIN</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-text-primary">Telematics VIN</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-text-primary">Match Type</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-text-primary">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredUnits.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-text-secondary">
                        {filter === 'unmatched'
                          ? 'No unmatched units.'
                          : 'No units found. Click Refresh Units to import from the repair database.'}
                      </td>
                    </tr>
                  ) : (
                    filteredUnits.map(unit => (
                      <tr
                        key={unit.id}
                        className={`hover:bg-bg-hover transition-colors ${unit.matchType === 'UNMATCHED' ? 'bg-amber-50/40 dark:bg-amber-900/10 border-l-2 border-l-amber-400' : ''}`}
                      >
                        <td className="px-4 py-3 text-sm font-semibold">
                          {unit.repairUnitNumber || <span className="text-text-secondary italic">N/A</span>}
                        </td>
                        <td className="px-4 py-3 text-xs font-mono text-text-secondary">
                          {unit.repairVin || '—'}
                        </td>
                        <td className="px-4 py-3 text-xs font-mono text-text-secondary">
                          {unit.telematicsVin || '—'}
                        </td>
                        <td className="px-4 py-3">
                          {matchTypeBadge(unit.matchType)}
                        </td>
                        <td className="px-4 py-3">
                          {unit.matchType === 'UNMATCHED' ? (
                            matchingUnitId === unit.id ? (
                              <div className="flex items-center gap-2">
                                <select
                                  value={matchingVin}
                                  onChange={e => setMatchingVin(e.target.value)}
                                  className="text-xs px-2 py-1 rounded border border-border bg-bg-primary text-text-primary focus:outline-none focus:border-primary"
                                >
                                  <option value="">Select VIN...</option>
                                  {availableVins.map(v => (
                                    <option key={v} value={v}>{v}</option>
                                  ))}
                                </select>
                                <button
                                  onClick={() => confirmMatch(unit.id)}
                                  disabled={!matchingVin || matchingInProgress}
                                  className="text-xs px-2 py-1 rounded bg-primary text-white disabled:opacity-50 hover:bg-primary-dark"
                                >
                                  {matchingInProgress ? 'Saving...' : 'Match'}
                                </button>
                                <button
                                  onClick={() => setMatchingUnitId(null)}
                                  className="text-xs px-2 py-1 rounded border border-border text-text-secondary hover:bg-bg-hover"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => startMatching(unit.id)}
                                className="text-xs px-2 py-1 rounded border border-primary text-primary hover:bg-primary/10 transition-colors"
                              >
                                Match VIN
                              </button>
                            )
                          ) : (
                            <button
                              onClick={() => unmatchUnit(unit.id)}
                              disabled={unmatchingId === unit.id}
                              className="text-xs px-2 py-1 rounded border border-border text-text-secondary hover:bg-bg-hover hover:border-destructive hover:text-destructive transition-colors disabled:opacity-50"
                            >
                              {unmatchingId === unit.id ? 'Removing...' : 'Unmatch'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
