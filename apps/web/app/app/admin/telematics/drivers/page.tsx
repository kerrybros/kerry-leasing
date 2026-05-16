'use client';

import Link from 'next/link';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { ArrowLeft, RefreshCw, Search } from 'lucide-react';
import { useOrganization } from '@clerk/nextjs';
import { useApiClient } from '@/hooks/useApiClient';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/Skeleton';

interface MotiveDriver {
  id: string;
  motiveDriverId: number;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  email: string | null;
  phone: string | null;
  status: string | null;
  isIncluded: boolean;
  lastSyncedAt: string;
}

interface DriverSummary {
  total: number;
  included: number;
  excluded: number;
}

type Filter = 'all' | 'included' | 'excluded';

function fullName(d: MotiveDriver): string {
  return [d.firstName, d.lastName].filter(Boolean).join(' ') || d.username || `Driver ${d.motiveDriverId}`;
}

export default function AdminDriversSetupPage() {
  const { organization } = useOrganization();
  const { getApi } = useApiClient();

  const [drivers, setDrivers] = useState<MotiveDriver[]>([]);
  const [summary, setSummary] = useState<DriverSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const api = await getApi();
      const data = await api.get<{ drivers: MotiveDriver[]; summary: DriverSummary }>(
        '/admin/drivers-setup/drivers'
      );
      setDrivers(data.drivers ?? []);
      setSummary(data.summary ?? null);
    } catch {
      setDrivers([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [getApi]);

  useEffect(() => {
    load();
  }, [load]);

  const handleToggle = async (driver: MotiveDriver) => {
    setTogglingId(driver.id);
    try {
      const api = await getApi();
      await api.put(`/admin/drivers-setup/drivers/${driver.id}/inclusion`, {
        isIncluded: !driver.isIncluded,
      });
      setDrivers(prev =>
        prev.map(d => (d.id === driver.id ? { ...d, isIncluded: !d.isIncluded } : d))
      );
      setSummary(prev =>
        prev
          ? {
              ...prev,
              included: prev.included + (driver.isIncluded ? -1 : 1),
              excluded: prev.excluded + (driver.isIncluded ? 1 : -1),
            }
          : prev
      );
    } catch {
      // no-op; toggle reverts visually since state not updated
    } finally {
      setTogglingId(null);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const api = await getApi();
      const result = await api.post<{ success: boolean; result: { recordCount: number; skipped?: boolean; skipReason?: string } }>(
        '/admin/drivers-setup/sync',
        {}
      );
      if (result.result.skipped) {
        setSyncMsg({ type: 'error', text: `Sync skipped: ${result.result.skipReason ?? 'unknown reason'}` });
      } else {
        setSyncMsg({ type: 'success', text: `Synced — ${result.result.recordCount} drivers from Motive.` });
      }
      await load();
    } catch (err: any) {
      setSyncMsg({ type: 'error', text: err?.message ?? 'Sync failed' });
    } finally {
      setSyncing(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = drivers;
    if (filter === 'included') rows = rows.filter(d => d.isIncluded);
    else if (filter === 'excluded') rows = rows.filter(d => !d.isIncluded);
    if (q) {
      rows = rows.filter(
        d =>
          fullName(d).toLowerCase().includes(q) ||
          (d.email ?? '').toLowerCase().includes(q) ||
          String(d.motiveDriverId).includes(q)
      );
    }
    return rows;
  }, [drivers, filter, search]);

  return (
    <div className="mx-auto px-4 py-8 max-w-5xl flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <Link
          href="/app/admin/telematics"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground w-fit no-underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Telematics
        </Link>
        <div>
          <h1 className="text-3xl font-bold mb-1">Driver Setup</h1>
          <p className="text-sm text-muted-foreground">
            Choose which Motive drivers appear in{' '}
            <span className="font-semibold text-foreground">{organization?.name}</span>&apos;s portal.
            Excluded drivers are hidden from the scoreboard, SMS reports, and all driver KPIs.
          </p>
        </div>
      </div>

      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Total drivers', value: summary.total, color: '' },
            { label: 'Included', value: summary.included, color: 'text-green-600 dark:text-green-400' },
            { label: 'Excluded', value: summary.excluded, color: summary.excluded > 0 ? 'text-amber-600 dark:text-amber-400' : '' },
          ].map(k => (
            <Card key={k.label}>
              <CardContent className="py-4 text-center">
                <p className={`text-3xl font-bold ${k.color}`}>{k.value}</p>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mt-1">{k.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button onClick={handleSync} disabled={syncing || loading} variant="outline" size="sm" className="gap-1.5">
          <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Syncing…' : 'Refresh from Motive'}
        </Button>

        <div className="flex rounded-md border border-border overflow-hidden text-xs">
          {(['all', 'included', 'excluded'] as Filter[]).map(f => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 font-medium transition-colors border-l first:border-l-0 border-border capitalize ${
                filter === f ? 'bg-primary text-primary-foreground' : 'bg-transparent text-muted-foreground hover:bg-accent'
              }`}
            >
              {f === 'all'
                ? `All (${drivers.length})`
                : f === 'included'
                  ? `Included (${summary?.included ?? 0})`
                  : `Excluded (${summary?.excluded ?? 0})`}
            </button>
          ))}
        </div>

        <div className="relative ml-auto min-w-[220px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search name, email, or ID…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
      </div>

      {syncMsg && (
        <p className={`text-sm ${syncMsg.type === 'success' ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
          {syncMsg.text}
        </p>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} style={{ height: 44, borderRadius: 8 }} />
          ))}
        </div>
      ) : drivers.length === 0 ? (
        <Card>
          <CardContent className="py-16 flex flex-col items-center gap-2 text-center">
            <p className="text-sm font-medium text-muted-foreground">No Motive drivers found.</p>
            <p className="text-xs text-muted-foreground max-w-sm">
              Click &ldquo;Refresh from Motive&rdquo; to pull the latest driver roster. If this org has no Motive
              integration, configure it on the Telematics page first.
            </p>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No drivers match the current filters.
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Driver</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Email</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Phone</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Motive ID</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">In Portal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(driver => (
                <tr
                  key={driver.id}
                  className={`transition-colors ${!driver.isIncluded ? 'bg-amber-50/40 dark:bg-amber-900/10' : 'hover:bg-muted/30'}`}
                >
                  <td className="px-4 py-3 font-semibold text-foreground">
                    {fullName(driver)}
                    {driver.status && driver.status.toLowerCase() !== 'active' && (
                      <span className="ml-2 text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded uppercase">
                        {driver.status}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{driver.email ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{driver.phone ?? '—'}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{driver.motiveDriverId}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      disabled={togglingId === driver.id}
                      onClick={() => handleToggle(driver)}
                      title={driver.isIncluded ? 'Click to exclude from portal' : 'Click to include in portal'}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                        driver.isIncluded
                          ? 'bg-green-100 text-green-700 hover:bg-red-50 hover:text-red-600 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-muted text-muted-foreground hover:bg-green-50 hover:text-green-700 dark:hover:bg-green-900/20'
                      } ${togglingId === driver.id ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      {togglingId === driver.id ? '…' : driver.isIncluded ? 'Included' : 'Excluded'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
