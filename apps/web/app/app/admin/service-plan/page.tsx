'use client';

import { useOrganization } from '@clerk/nextjs';
import { useCallback, useEffect, useState } from 'react';
import { useApiClient } from '@/hooks/useApiClient';
import { KpiCard } from '@/components/KpiCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
      <Badge variant="default" className="bg-green-600 hover:bg-green-600">Auto</Badge>
    );
    if (type === 'MANUAL') return (
      <Badge variant="secondary">Manual</Badge>
    );
    return (
      <Badge variant="outline" className="border-amber-400 text-amber-600 dark:text-amber-400">Unmatched</Badge>
    );
  };

  return (
    <div className="w-full p-6" style={{ maxWidth: '1400px' }}>
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
        <p className="text-muted-foreground text-sm">
          Manage unit matching for{' '}
          <span className="font-semibold text-foreground">{organization?.name}</span>
          {telematicsProvider && (
            <Badge variant="outline" className="ml-2 text-xs">{telematicsProvider}</Badge>
          )}
        </p>
      </div>

      {loading ? (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} style={{ height: 80, borderRadius: 8 }} />)}
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
            <KpiCard label="Unmatched" value={unmatchedCount} variant={unmatchedCount > 0 ? 'warning' : 'default'} />
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-3 items-center mb-4">
            <Button onClick={syncUnits} disabled={syncing} className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {syncing ? 'Syncing...' : 'Refresh Units'}
            </Button>

            <div className="flex rounded-md border border-border overflow-hidden">
              <Button
                variant={filter === 'all' ? 'default' : 'ghost'}
                size="sm"
                className="rounded-none border-0"
                onClick={() => setFilter('all')}
              >
                All ({units.length})
              </Button>
              <Button
                variant={filter === 'unmatched' ? 'default' : 'ghost'}
                size="sm"
                className="rounded-none border-0 border-l border-border"
                onClick={() => setFilter('unmatched')}
              >
                Unmatched ({unmatchedCount})
              </Button>
            </div>
          </div>

          {/* Units Table */}
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted border-b border-border">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Unit Number</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Repair VIN</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Telematics VIN</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Match Type</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredUnits.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                        {filter === 'unmatched'
                          ? 'No unmatched units.'
                          : 'No units found. Click Refresh Units to import from the repair database.'}
                      </td>
                    </tr>
                  ) : (
                    filteredUnits.map(unit => (
                      <tr
                        key={unit.id}
                        className={`hover:bg-accent/50 transition-colors ${unit.matchType === 'UNMATCHED' ? 'bg-amber-50/40 dark:bg-amber-900/10 border-l-2 border-l-amber-400' : ''}`}
                      >
                        <td className="px-4 py-3 text-sm font-semibold text-foreground">
                          {unit.repairUnitNumber || <span className="text-muted-foreground italic">N/A</span>}
                        </td>
                        <td className="px-4 py-3 text-xs font-mono text-muted-foreground">
                          {unit.repairVin || '—'}
                        </td>
                        <td className="px-4 py-3 text-xs font-mono text-muted-foreground">
                          {unit.telematicsVin || '—'}
                        </td>
                        <td className="px-4 py-3">
                          {matchTypeBadge(unit.matchType)}
                        </td>
                        <td className="px-4 py-3">
                          {unit.matchType === 'UNMATCHED' ? (
                            matchingUnitId === unit.id ? (
                              <div className="flex items-center gap-2 flex-wrap">
                                <Select value={matchingVin} onValueChange={v => setMatchingVin(v ?? '')}>
                                  <SelectTrigger className="h-8 text-xs w-[200px]">
                                    <SelectValue placeholder="Select VIN..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {availableVins.map(v => (
                                      <SelectItem key={v} value={v} className="text-xs font-mono">{v}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <Button
                                  size="sm"
                                  onClick={() => confirmMatch(unit.id)}
                                  disabled={!matchingVin || matchingInProgress}
                                  className="h-8"
                                >
                                  {matchingInProgress ? 'Saving...' : 'Match'}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setMatchingUnitId(null)}
                                  className="h-8"
                                >
                                  Cancel
                                </Button>
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => startMatching(unit.id)}
                                className="h-8 border-primary text-primary hover:bg-primary/10"
                              >
                                Match VIN
                              </Button>
                            )
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => unmatchUnit(unit.id)}
                              disabled={unmatchingId === unit.id}
                              className="h-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            >
                              {unmatchingId === unit.id ? 'Removing...' : 'Unmatch'}
                            </Button>
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
