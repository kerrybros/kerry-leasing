'use client';

import { useOrganization } from '@clerk/nextjs';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiClient } from '@/hooks/useApiClient';
import { useServicePlanQuery, useOrgSettingsQuery, keys } from '@/hooks/useDataQueries';
import { KpiCard } from '@/components/KpiCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/Skeleton';

interface Toast {
  id: number;
  type: 'success' | 'error';
  message: string;
}

interface TelematicsVehicle {
  vin: string | null;
  vehicleNumber: string | null;
  vehicleId: string | null;
  isMatched: boolean;
  matchedTo: string | null;
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

function sourceBadge(type: 'AUTO' | 'MANUAL' | 'UNMATCHED', isTelematicsOnly: boolean, isConfirmed: boolean) {
  if (isTelematicsOnly) return (
    <Badge variant="outline" className="border-blue-400 text-blue-600 dark:text-blue-400">Telematics Only</Badge>
  );
  if (type === 'AUTO') return (
    <Badge variant="default" className="bg-green-600 hover:bg-green-600">Matched on VIN</Badge>
  );
  if (type === 'MANUAL') return (
    <Badge variant="secondary">Manual Match</Badge>
  );
  if (isConfirmed) return (
    <Badge variant="outline" className="border-muted-foreground text-muted-foreground">Confirmed No Match</Badge>
  );
  return (
    <Badge variant="outline" className="border-amber-400 text-amber-600 dark:text-amber-400">Repair Only</Badge>
  );
}

/** Key used to identify a vehicle in the match dropdown */
function vehicleKey(v: TelematicsVehicle): string {
  return v.vin ?? `id:${v.vehicleId}`;
}

export default function AdminServicePlanPage() {
  const { organization } = useOrganization();
  const { getApi } = useApiClient();
  const queryClient = useQueryClient();
  const { toasts, addToast } = useToasts();

  const servicePlanQuery = useServicePlanQuery();
  const orgSettingsQuery = useOrgSettingsQuery();

  const [filter, setFilter] = useState<'all' | 'included' | 'matched' | 'unmatched' | 'confirmed' | 'excluded'>('all');
  const [sortCol, setSortCol] = useState<'name' | 'repair' | 'telematics' | 'source' | 'inPlan' | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  function handleSort(col: typeof sortCol) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  }
  const [availableVehicles, setAvailableVehicles] = useState<TelematicsVehicle[]>([]);
  const [matchingUnitId, setMatchingUnitId] = useState<string | null>(null);
  const [matchingKey, setMatchingKey] = useState('');

  // Telematics-only → repair matching state
  interface RepairUnit { id: string; repairUnitNumber: string | null; repairVin: string | null; customUnitName: string | null; }
  const [availableRepairUnits, setAvailableRepairUnits] = useState<RepairUnit[]>([]);
  const [mergingUnitId, setMergingUnitId] = useState<string | null>(null);
  const [mergeRepairId, setMergeRepairId] = useState('');

  // Inline name editing state: unitId → current draft value
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editingNameValue, setEditingNameValue] = useState('');

  const units = servicePlanQuery.data?.units ?? [];
  const summary = servicePlanQuery.data?.summary ?? null;
  const telematicsProvider = orgSettingsQuery.data?.telematicsProvider ?? null;
  const orgId = organization?.id ?? '';

  const syncMutation = useMutation({
    mutationFn: async () => {
      const api = await getApi();
      return api.post<{
        success: boolean; synced: number; autoMatched: number;
        summary: { totalUnits: number; fromRepair: number; fromTelematics: number; matchedUnits: number };
      }>('/admin/service-plan/sync', {});
    },
    onSuccess: (data) => {
      addToast('success', `Synced ${data.synced} units. ${data.autoMatched} auto-matched.`);
      queryClient.invalidateQueries({ queryKey: keys.servicePlan(orgId) });
    },
    onError: (err: unknown) => {
      addToast('error', err instanceof Error ? err.message : 'Failed to sync units');
    },
  });

  const [pendingInclusionIds, setPendingInclusionIds] = useState<Set<string>>(new Set());

  const inclusionMutation = useMutation({
    mutationFn: async ({ unitId, isIncluded }: { unitId: string; isIncluded: boolean }) => {
      const api = await getApi();
      await api.put(`/admin/service-plan/units/${unitId}/inclusion`, { isIncluded });
    },
    onMutate: async ({ unitId, isIncluded }) => {
      setPendingInclusionIds(prev => new Set([...prev, unitId]));
      await queryClient.cancelQueries({ queryKey: keys.servicePlan(orgId) });
      const previous = queryClient.getQueryData(keys.servicePlan(orgId));
      queryClient.setQueryData(keys.servicePlan(orgId), (old: any) => {
        if (!old?.units) return old;
        return { ...old, units: old.units.map((u: any) => u.id === unitId ? { ...u, isIncluded } : u) };
      });
      return { previous };
    },
    onError: (err: unknown, _, context: any) => {
      if (context?.previous) queryClient.setQueryData(keys.servicePlan(orgId), context.previous);
      addToast('error', err instanceof Error ? err.message : 'Failed to update unit');
    },
    onSuccess: (_, { isIncluded }) => {
      addToast('success', isIncluded ? 'Unit added to plan.' : 'Unit excluded from plan.');
    },
    onSettled: (_d, _e, { unitId }) => {
      setPendingInclusionIds(prev => { const s = new Set(prev); s.delete(unitId); return s; });
      queryClient.invalidateQueries({ queryKey: keys.servicePlan(orgId) });
    },
  });

  const matchMutation = useMutation({
    mutationFn: async ({ unitId, key }: { unitId: string; key: string }) => {
      const api = await getApi();
      const vehicle = availableVehicles.find(v => vehicleKey(v) === key);
      const body = vehicle?.vin
        ? { telematicsVin: vehicle.vin }
        : { telematicsVehicleId: vehicle?.vehicleId };
      await api.put(`/admin/service-plan/units/${unitId}/match`, body);
    },
    onSuccess: () => {
      addToast('success', 'Unit matched successfully.');
      setMatchingUnitId(null);
      setMatchingKey('');
      queryClient.invalidateQueries({ queryKey: keys.servicePlan(orgId) });
    },
    onError: (err: unknown) => {
      addToast('error', err instanceof Error ? err.message : 'Failed to match unit');
    },
  });

  const unmatchMutation = useMutation({
    mutationFn: async (unitId: string) => {
      const api = await getApi();
      await api.delete(`/admin/service-plan/units/${unitId}/match`);
    },
    onSuccess: () => {
      addToast('success', 'Unit unmatched.');
      queryClient.invalidateQueries({ queryKey: keys.servicePlan(orgId) });
    },
    onError: (err: unknown) => {
      addToast('error', err instanceof Error ? err.message : 'Failed to unmatch unit');
    },
  });

  const applySuggestionMutation = useMutation({
    mutationFn: async ({ unitId, telematicsVin }: { unitId: string; telematicsVin: string }) => {
      const api = await getApi();
      await api.put(`/admin/service-plan/units/${unitId}/match`, { telematicsVin });
    },
    onSuccess: () => {
      addToast('success', 'Match applied.');
      queryClient.invalidateQueries({ queryKey: keys.servicePlan(orgId) });
    },
    onError: (err: unknown) => {
      addToast('error', err instanceof Error ? err.message : 'Failed to apply match');
    },
  });

  const confirmMutation = useMutation({
    mutationFn: async ({ unitId, isConfirmed }: { unitId: string; isConfirmed: boolean }) => {
      const api = await getApi();
      await api.put(`/admin/service-plan/units/${unitId}/confirm`, { isConfirmed });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.servicePlan(orgId) });
    },
    onError: (err: unknown) => {
      addToast('error', err instanceof Error ? err.message : 'Failed to update unit');
    },
  });

  const mergeMutation = useMutation({
    mutationFn: async ({ telematicsUnitId, repairUnitId }: { telematicsUnitId: string; repairUnitId: string }) => {
      const api = await getApi();
      await api.post(`/admin/service-plan/units/${telematicsUnitId}/merge`, { repairUnitId });
    },
    onSuccess: () => {
      addToast('success', 'Units merged successfully.');
      setMergingUnitId(null);
      setMergeRepairId('');
      queryClient.invalidateQueries({ queryKey: keys.servicePlan(orgId) });
    },
    onError: (err: unknown) => {
      addToast('error', err instanceof Error ? err.message : 'Failed to merge units');
    },
  });

  const loadAvailableRepairUnits = async () => {
    try {
      const api = await getApi();
      const data = await api.get<{ units: { id: string; repairUnitNumber: string | null; repairVin: string | null; customUnitName: string | null }[] }>('/admin/service-plan/available-repair-units');
      setAvailableRepairUnits(data.units ?? []);
    } catch {
      setAvailableRepairUnits([]);
    }
  };

  const startMerging = (unitId: string) => {
    setMergingUnitId(unitId);
    setMergeRepairId('');
    if (availableRepairUnits.length === 0) loadAvailableRepairUnits();
  };

  const nameMutation = useMutation({
    mutationFn: async ({ unitId, customUnitName }: { unitId: string; customUnitName: string | null }) => {
      const api = await getApi();
      await api.put(`/admin/service-plan/units/${unitId}/name`, { customUnitName });
    },
    onSuccess: () => {
      setEditingNameId(null);
      queryClient.invalidateQueries({ queryKey: keys.servicePlan(orgId) });
    },
    onError: (err: unknown) => {
      addToast('error', err instanceof Error ? err.message : 'Failed to save name');
    },
  });

  const loadAvailableVehicles = async () => {
    try {
      const api = await getApi();
      const data = await api.get<{ vins: TelematicsVehicle[] }>('/admin/service-plan/available-vins');
      setAvailableVehicles(data.vins ?? []);
    } catch {
      setAvailableVehicles([]);
    }
  };

  const startMatching = (unitId: string) => {
    setMatchingUnitId(unitId);
    setMatchingKey('');
    if (availableVehicles.length === 0) loadAvailableVehicles();
  };

  const startEditingName = (unitId: string, currentName: string) => {
    setEditingNameId(unitId);
    setEditingNameValue(currentName);
  };

  // A true match requires both a repair record AND a telematics record.
  // Telematics-only units are never "matched" regardless of their stored matchType.
  // Confirmed units are acknowledged as intentionally having no telematics (e.g. trailers).
  const isMatched = (u: any) => !u.isTelematicsOnly && u.matchType !== 'UNMATCHED';
  const isConfirmedUnit = (u: any) => !isMatched(u) && !!u.isConfirmed;
  // "Unmatched" = needs attention: not matched, not confirmed
  const isUnmatched = (u: any) => !isMatched(u) && !u.isConfirmed;

  const autoCount = units.filter(u => !u.isTelematicsOnly && u.matchType === 'AUTO').length;
  const manualCount = units.filter(u => !u.isTelematicsOnly && u.matchType === 'MANUAL').length;
  const unmatchedCount = units.filter(isUnmatched).length;
  const confirmedCount = units.filter(isConfirmedUnit).length;
  const excludedCount = units.filter(u => !(u as any).isIncluded).length;
  const includedCount = units.filter(u => (u as any).isIncluded).length;
  const matchedCount = units.filter(isMatched).length;
  const filteredUnits = (() => {
    const base = filter === 'included'
      ? units.filter(u => (u as any).isIncluded)
      : filter === 'matched'
      ? units.filter(isMatched)
      : filter === 'unmatched'
      ? units.filter(isUnmatched)
      : filter === 'confirmed'
      ? units.filter(isConfirmedUnit)
      : filter === 'excluded'
      ? units.filter(u => !(u as any).isIncluded)
      : units;

    if (!sortCol) return base;

    const key = (u: any): string => {
      if (sortCol === 'name') return (u.customUnitName ?? u.repairUnitNumber ?? u.telematicsData?.vehicleNumber ?? '').toLowerCase();
      if (sortCol === 'repair') return (u.isTelematicsOnly ? '' : (u.repairUnitNumber ?? '')).toLowerCase();
      if (sortCol === 'telematics') return (u.telematicsData?.vehicleNumber ?? '').toLowerCase();
      if (sortCol === 'source') {
        if (u.isTelematicsOnly) return 'telematics only';
        if (u.matchType === 'AUTO') return 'matched on vin';
        if (u.matchType === 'MANUAL') return 'manual match';
        if (u.isConfirmed) return 'confirmed no match';
        return 'repair only';
      }
      if (sortCol === 'inPlan') return u.isIncluded ? 'a' : 'b';
      return '';
    };

    return [...base].sort((a, b) => {
      const cmp = key(a).localeCompare(key(b), undefined, { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  })();

  const isLoading = servicePlanQuery.isLoading || orgSettingsQuery.isLoading;

  return (
    <div className="w-full p-6" style={{ maxWidth: '1400px' }}>
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

      {isLoading ? (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} style={{ height: 80, borderRadius: 8 }} />)}
          </div>
          <Skeleton style={{ height: 400, borderRadius: 8 }} />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <KpiCard label="Total Units" value={summary?.total ?? 0} />
            <KpiCard label="Matched on VIN" value={autoCount} variant="success" />
            <KpiCard label="Manual Match" value={manualCount} />
            <KpiCard label="Unmatched" value={unmatchedCount} />
            <KpiCard label="Excluded" value={excludedCount} variant={excludedCount > 0 ? 'warning' : 'default'} />
          </div>

          <div className="flex flex-wrap gap-3 items-center mb-4">
            <Button
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
              className="flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {syncMutation.isPending ? 'Syncing...' : 'Refresh Units'}
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
                variant={filter === 'included' ? 'default' : 'ghost'}
                size="sm"
                className="rounded-none border-0 border-l border-border"
                onClick={() => setFilter('included')}
              >
                Included ({includedCount})
              </Button>
              <Button
                variant={filter === 'matched' ? 'default' : 'ghost'}
                size="sm"
                className="rounded-none border-0 border-l border-border"
                onClick={() => setFilter('matched')}
              >
                Matched ({matchedCount})
              </Button>
              <Button
                variant={filter === 'unmatched' ? 'default' : 'ghost'}
                size="sm"
                className="rounded-none border-0 border-l border-border"
                onClick={() => setFilter('unmatched')}
              >
                Unmatched ({unmatchedCount})
              </Button>
              <Button
                variant={filter === 'confirmed' ? 'default' : 'ghost'}
                size="sm"
                className="rounded-none border-0 border-l border-border"
                onClick={() => setFilter('confirmed')}
              >
                Confirmed ({confirmedCount})
              </Button>
              <Button
                variant={filter === 'excluded' ? 'default' : 'ghost'}
                size="sm"
                className="rounded-none border-0 border-l border-border"
                onClick={() => setFilter('excluded')}
              >
                Excluded ({excludedCount})
              </Button>
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted border-b border-border">
                  <tr>
                    {([
                      ['name', 'Unit Name'],
                      ['repair', 'Repair System'],
                      ['telematics', 'Telematics'],
                      ['source', 'Source'],
                      ['inPlan', 'In Plan'],
                    ] as const).map(([col, label]) => (
                      <th
                        key={col}
                        onClick={() => handleSort(col)}
                        className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide cursor-pointer select-none hover:text-foreground transition-colors"
                      >
                        <span className="inline-flex items-center gap-1">
                          {label}
                          <span className="text-[10px]">
                            {sortCol === col ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
                          </span>
                        </span>
                      </th>
                    ))}
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredUnits.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                        {filter === 'included'
                          ? 'No included units.'
                          : filter === 'matched'
                          ? 'No matched units.'
                          : filter === 'confirmed'
                          ? 'No confirmed units.'
                          : filter === 'unmatched'
                          ? 'No unmatched units.'
                          : filter === 'excluded'
                          ? 'No excluded units.'
                          : 'No units found. Click Refresh Units to import from the repair database.'}
                      </td>
                    </tr>
                  ) : (
                    filteredUnits.map(unit => {
                      const u = unit as any;
                      const customName = u.customUnitName as string | null;
                      // For telematics-only units, repairUnitNumber holds the telematics vehicle name — not a repair record
                      const repairName = !u.isTelematicsOnly ? (u.repairUnitNumber as string | null) : null;
                      const telematicsName = (u.telematicsData?.vehicleNumber ?? null) as string | null;
                      const displayName = customName ?? repairName ?? telematicsName;
                      const namesMismatch = !customName && repairName && telematicsName && repairName !== telematicsName;
                      const isEditingName = editingNameId === unit.id;

                      return (
                        <tr
                          key={unit.id}
                          className={`hover:bg-accent/50 transition-colors ${!u.isIncluded ? 'bg-amber-50/40 dark:bg-amber-900/10 border-l-2 border-l-amber-400' : ''}`}
                        >
                          {/* Unit Name — editable */}
                          <td className="px-4 py-3 min-w-[160px]">
                            {isEditingName ? (
                              <div className="flex items-center gap-1.5">
                                <Input
                                  className="h-7 text-sm w-36"
                                  value={editingNameValue}
                                  onChange={e => setEditingNameValue(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') nameMutation.mutate({ unitId: unit.id, customUnitName: editingNameValue || null });
                                    if (e.key === 'Escape') setEditingNameId(null);
                                  }}
                                  autoFocus
                                />
                                <button
                                  type="button"
                                  onClick={() => nameMutation.mutate({ unitId: unit.id, customUnitName: editingNameValue || null })}
                                  disabled={nameMutation.isPending}
                                  className="text-primary hover:text-primary/80 disabled:opacity-50"
                                  title="Save"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                  </svg>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingNameId(null)}
                                  className="text-muted-foreground hover:text-foreground"
                                  title="Cancel"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-start gap-1.5 group">
                                <div>
                                  <span className="text-sm font-semibold text-foreground">
                                    {displayName ?? <span className="text-muted-foreground italic font-normal">No name</span>}
                                  </span>
                                  {customName && (
                                    <div className="text-xs text-muted-foreground">custom</div>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => startEditingName(unit.id, customName ?? repairName ?? telematicsName ?? '')}
                                  className="mt-0.5 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
                                  title="Edit unit name"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                  </svg>
                                </button>
                              </div>
                            )}
                          </td>

                          {/* Repair System */}
                          <td className="px-4 py-3">
                            {!u.isTelematicsOnly && repairName ? (
                              <div>
                                <div className="text-sm text-foreground">{repairName}</div>
                                {u.repairVin && (
                                  <div className="text-xs font-mono text-muted-foreground">{u.repairVin}</div>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>

                          {/* Telematics */}
                          <td className="px-4 py-3">
                            {telematicsName || u.telematicsVin ? (
                              <div>
                                {telematicsName && (
                                  <div className={`text-sm ${namesMismatch ? 'text-amber-600 dark:text-amber-400' : 'text-foreground'}`}>
                                    {telematicsName}
                                    {namesMismatch && (
                                      <span className="ml-1 text-xs" title="Telematics name differs from repair unit number">⚠</span>
                                    )}
                                  </div>
                                )}
                                {u.telematicsVin && (
                                  <div className="text-xs font-mono text-muted-foreground">{u.telematicsVin}</div>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>

                          {/* Source / match status */}
                          <td className="px-4 py-3">
                            {sourceBadge(unit.matchType, u.isTelematicsOnly, u.isConfirmed)}
                          </td>

                          {/* In Plan toggle */}
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() => {
                                if (pendingInclusionIds.has(unit.id)) return;
                                inclusionMutation.mutate({ unitId: unit.id, isIncluded: !u.isIncluded });
                              }}
                              disabled={pendingInclusionIds.has(unit.id)}
                              title={u.isIncluded ? 'Included in plan — click to exclude' : 'Excluded from plan — click to include'}
                              className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                                u.isIncluded
                                  ? 'bg-green-100 text-green-700 hover:bg-red-50 hover:text-red-600 dark:bg-green-900/30 dark:text-green-400'
                                  : 'bg-muted text-muted-foreground hover:bg-green-50 hover:text-green-700'
                              }`}
                            >
                              {pendingInclusionIds.has(unit.id) ? '...' : u.isIncluded ? 'Included' : 'Excluded'}
                            </button>
                          </td>

                          {/* Actions */}
                          <td className="px-4 py-3">
                            {isConfirmedUnit(u) ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => confirmMutation.mutate({ unitId: unit.id, isConfirmed: false })}
                                disabled={confirmMutation.isPending}
                                className="h-8 text-muted-foreground hover:text-foreground"
                                title="Un-confirm — move back to unmatched so it can be matched or re-confirmed"
                              >
                                Un-confirm
                              </Button>
                            ) : isUnmatched(u) && !u.isTelematicsOnly ? (
                              matchingUnitId === unit.id ? (
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Select value={matchingKey} onValueChange={v => setMatchingKey(v ?? '')}>
                                    <SelectTrigger className="h-8 text-xs w-[240px]">
                                      <SelectValue placeholder="Select telematics vehicle..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {availableVehicles.length === 0 && (
                                        <div className="px-3 py-2 text-xs text-muted-foreground">Loading vehicles...</div>
                                      )}
                                      {availableVehicles.map(v => {
                                        const key = vehicleKey(v);
                                        return (
                                          <SelectItem key={key} value={key} className="text-xs">
                                            <div className="flex flex-col">
                                              <span className="font-medium">
                                                {v.vehicleNumber ?? 'Unknown vehicle'}
                                                {v.isMatched && (
                                                  <span className="ml-1.5 text-muted-foreground">(matched)</span>
                                                )}
                                              </span>
                                              {v.vin && (
                                                <span className="font-mono text-muted-foreground">{v.vin}</span>
                                              )}
                                            </div>
                                          </SelectItem>
                                        );
                                      })}
                                    </SelectContent>
                                  </Select>
                                  <Button
                                    size="sm"
                                    onClick={() => matchMutation.mutate({ unitId: unit.id, key: matchingKey })}
                                    disabled={!matchingKey || matchMutation.isPending}
                                    className="h-8"
                                  >
                                    {matchMutation.isPending ? 'Saving...' : 'Match'}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => { setMatchingUnitId(null); setMatchingKey(''); }}
                                    className="h-8"
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              ) : (
                                <div className="flex flex-col gap-1.5">
                                  {u.suggestedMatch?.telematicsVin && (
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                                        Possible match: {u.suggestedMatch.vehicleNumber}
                                      </span>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => applySuggestionMutation.mutate({ unitId: unit.id, telematicsVin: u.suggestedMatch!.telematicsVin })}
                                        disabled={applySuggestionMutation.isPending}
                                        className="h-7 text-xs border-amber-400 text-amber-700 hover:bg-amber-50 dark:border-amber-500 dark:text-amber-400 dark:hover:bg-amber-950"
                                      >
                                        Use Match
                                      </Button>
                                    </div>
                                  )}
                                  <div className="flex items-center gap-2">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => startMatching(unit.id)}
                                      className="h-8 border-primary text-primary hover:bg-primary/10"
                                    >
                                      Match Vehicle
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => confirmMutation.mutate({ unitId: unit.id, isConfirmed: true })}
                                      disabled={confirmMutation.isPending}
                                      className="h-8 text-muted-foreground hover:text-foreground"
                                      title="Mark as confirmed — intentionally has no telematics"
                                    >
                                      Confirm
                                    </Button>
                                  </div>
                                </div>
                              )
                            ) : isMatched(u) ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => unmatchMutation.mutate(unit.id)}
                                disabled={unmatchMutation.isPending}
                                className="h-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                title="Unmatch — removes the telematics link so you can re-match manually or re-sync"
                              >
                                {unmatchMutation.isPending ? 'Removing...' : 'Unmatch'}
                              </Button>
                            ) : u.isTelematicsOnly ? (
                              mergingUnitId === unit.id ? (
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Select value={mergeRepairId} onValueChange={v => setMergeRepairId(v ?? '')}>
                                    <SelectTrigger className="h-8 text-xs w-[200px]">
                                      <SelectValue placeholder="Select repair unit..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {availableRepairUnits.length === 0 && (
                                        <div className="px-3 py-2 text-xs text-muted-foreground">Loading units...</div>
                                      )}
                                      {availableRepairUnits.map(r => (
                                        <SelectItem key={r.id} value={r.id} className="text-xs">
                                          <div className="flex flex-col">
                                            <span className="font-medium">{r.customUnitName ?? r.repairUnitNumber ?? r.id}</span>
                                            {r.repairVin && <span className="font-mono text-muted-foreground">{r.repairVin}</span>}
                                          </div>
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <Button
                                    size="sm"
                                    onClick={() => mergeMutation.mutate({ telematicsUnitId: unit.id, repairUnitId: mergeRepairId })}
                                    disabled={!mergeRepairId || mergeMutation.isPending}
                                    className="h-8"
                                  >
                                    {mergeMutation.isPending ? 'Merging...' : 'Merge'}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => { setMergingUnitId(null); setMergeRepairId(''); }}
                                    className="h-8"
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => startMerging(unit.id)}
                                  className="h-8 border-primary text-primary hover:bg-primary/10"
                                >
                                  Match to Repair
                                </Button>
                              )
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
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
