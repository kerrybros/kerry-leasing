'use client';

import { useState, useEffect, useCallback } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useApiClient } from '@/hooks/useApiClient';

interface FleetUnit {
  id: string;
  repairUnitNumber: string | null;
  repairVin: string | null;
  telematicsVin: string | null;
  matchType: 'AUTO' | 'MANUAL' | 'UNMATCHED';
  isIncluded: boolean;
  isTelematicsOnly: boolean | null;
}

interface FleetSummary {
  total: number;
  included: number;
  excluded: number;
  matched: number;
  unmatched: number;
}

interface FleetDrawerProps {
  open: boolean;
  onClose: () => void;
  clerkOrgId: string;
  orgName: string;
}

type Filter = 'all' | 'excluded' | 'unmatched';

function MatchBadge({ type }: { type: FleetUnit['matchType'] }) {
  if (type === 'AUTO') return <Badge className="bg-green-600 hover:bg-green-600 text-[10px] px-1.5 py-0">Auto</Badge>;
  if (type === 'MANUAL') return <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Manual</Badge>;
  return <Badge variant="outline" className="border-amber-400 text-amber-600 dark:text-amber-400 text-[10px] px-1.5 py-0">Unmatched</Badge>;
}

export function FleetDrawer({ open, onClose, clerkOrgId, orgName }: FleetDrawerProps) {
  const { getApi } = useApiClient();

  const [units, setUnits] = useState<FleetUnit[]>([]);
  const [summary, setSummary] = useState<FleetSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  const load = useCallback(async () => {
    if (!clerkOrgId) return;
    setLoading(true);
    try {
      const api = await getApi();
      const data = await api.get<{ units: FleetUnit[]; summary: FleetSummary }>(
        `/admin/orgs/${clerkOrgId}/fleet`
      );
      setUnits(data.units ?? []);
      setSummary(data.summary ?? null);
    } catch {
      setUnits([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [clerkOrgId, getApi]);

  useEffect(() => {
    if (open) { load(); setSyncMsg(null); setFilter('all'); }
  }, [open, load]);

  const handleToggle = async (unit: FleetUnit) => {
    setTogglingId(unit.id);
    try {
      const api = await getApi();
      await api.put(`/admin/orgs/${clerkOrgId}/fleet/units/${unit.id}/inclusion`, {
        isIncluded: !unit.isIncluded,
      });
      setUnits(prev => prev.map(u => u.id === unit.id ? { ...u, isIncluded: !u.isIncluded } : u));
      setSummary(prev => prev ? {
        ...prev,
        included: prev.included + (unit.isIncluded ? -1 : 1),
        excluded: prev.excluded + (unit.isIncluded ? 1 : -1),
      } : prev);
    } catch {
      // no-op; unit reverts visually since state not updated
    } finally {
      setTogglingId(null);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const api = await getApi();
      const result = await api.post<{ ok: boolean; unitCount: number }>(
        `/admin/orgs/${clerkOrgId}/fleet/sync`, {}
      );
      setSyncMsg({ type: 'success', text: `Synced — ${result.unitCount} units in fleet.` });
      await load();
    } catch (err: any) {
      setSyncMsg({ type: 'error', text: err.message ?? 'Sync failed' });
    } finally {
      setSyncing(false);
    }
  };

  const filtered = filter === 'excluded'
    ? units.filter(u => !u.isIncluded)
    : filter === 'unmatched'
    ? units.filter(u => u.matchType === 'UNMATCHED')
    : units;

  return (
    <Sheet open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <SheetContent className="w-full sm:max-w-2xl flex flex-col gap-0 p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border">
          <SheetTitle className="flex items-center gap-2">
            Fleet Setup
            <span className="text-sm font-normal text-muted-foreground">—</span>
            <span className="text-base font-semibold">{orgName}</span>
          </SheetTitle>
          <SheetDescription>
            Manage which vehicles are included in this customer&apos;s fleet view. Sync pulls units from the repair database and matches them to telematics VINs.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto flex flex-col gap-4 px-6 py-4">
          {/* Summary row */}
          {summary && (
            <div className="grid grid-cols-5 gap-2">
              {[
                { label: 'Total', value: summary.total },
                { label: 'Included', value: summary.included, color: 'text-green-600 dark:text-green-400' },
                { label: 'Excluded', value: summary.excluded, color: summary.excluded > 0 ? 'text-amber-600 dark:text-amber-400' : '' },
                { label: 'Matched', value: summary.matched, color: 'text-blue-600 dark:text-blue-400' },
                { label: 'Unmatched', value: summary.unmatched, color: summary.unmatched > 0 ? 'text-muted-foreground' : '' },
              ].map(k => (
                <div key={k.label} className="rounded-lg border border-border bg-card px-3 py-2 text-center">
                  <p className={`text-lg font-bold ${k.color ?? ''}`}>{k.value}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{k.label}</p>
                </div>
              ))}
            </div>
          )}

          {/* Actions row */}
          <div className="flex items-center gap-3 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSync}
              disabled={syncing || loading}
              className="flex items-center gap-1.5"
            >
              <svg className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {syncing ? 'Syncing...' : 'Refresh Fleet'}
            </Button>

            {/* Filter tabs */}
            <div className="flex rounded-md border border-border overflow-hidden text-xs">
              {(['all', 'excluded', 'unmatched'] as Filter[]).map(f => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1.5 font-medium transition-colors border-l first:border-l-0 border-border capitalize ${
                    filter === f ? 'bg-primary text-primary-foreground' : 'bg-transparent text-muted-foreground hover:bg-accent'
                  }`}
                >
                  {f === 'all'
                    ? `All (${units.length})`
                    : f === 'excluded'
                    ? `Excluded (${summary?.excluded ?? 0})`
                    : `Unmatched (${summary?.unmatched ?? 0})`}
                </button>
              ))}
            </div>

            {syncMsg && (
              <p className={`text-sm ${syncMsg.type === 'success' ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
                {syncMsg.text}
              </p>
            )}
          </div>

          {/* Table */}
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
              Loading fleet units...
            </div>
          ) : units.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-2">
              <p className="text-sm font-medium text-muted-foreground">No fleet units found.</p>
              <p className="text-xs text-muted-foreground max-w-xs">
                The backfill may still be running, or this org may not have a repair customer linked. Click &ldquo;Refresh Fleet&rdquo; once the backdate completes.
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              No {filter} units.
            </div>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted border-b border-border">
                  <tr>
                    <th className="text-left px-3 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Unit</th>
                    <th className="text-left px-3 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Repair VIN</th>
                    <th className="text-left px-3 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Telematics VIN</th>
                    <th className="text-left px-3 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Match</th>
                    <th className="text-left px-3 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">In Fleet</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map(unit => (
                    <tr
                      key={unit.id}
                      className={`transition-colors ${!unit.isIncluded ? 'bg-amber-50/40 dark:bg-amber-900/10' : 'hover:bg-muted/30'}`}
                    >
                      <td className="px-3 py-2.5 font-semibold text-foreground">
                        {unit.repairUnitNumber ?? <span className="text-muted-foreground italic text-xs">—</span>}
                        {unit.isTelematicsOnly && (
                          <span className="ml-1.5 text-[9px] font-medium text-muted-foreground bg-muted px-1 py-0.5 rounded">telematics only</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-xs font-mono text-muted-foreground">{unit.repairVin ?? '—'}</td>
                      <td className="px-3 py-2.5 text-xs font-mono text-muted-foreground">{unit.telematicsVin ?? '—'}</td>
                      <td className="px-3 py-2.5"><MatchBadge type={unit.matchType} /></td>
                      <td className="px-3 py-2.5">
                        <button
                          type="button"
                          disabled={togglingId === unit.id}
                          onClick={() => handleToggle(unit)}
                          title={unit.isIncluded ? 'Click to exclude from fleet' : 'Click to include in fleet'}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                            unit.isIncluded
                              ? 'bg-green-100 text-green-700 hover:bg-red-50 hover:text-red-600 dark:bg-green-900/30 dark:text-green-400'
                              : 'bg-muted text-muted-foreground hover:bg-green-50 hover:text-green-700 dark:hover:bg-green-900/20'
                          } ${togglingId === unit.id ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                        >
                          {togglingId === unit.id ? '...' : unit.isIncluded ? 'Included' : 'Excluded'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-border flex justify-end">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
