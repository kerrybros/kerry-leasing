'use client';

import { useEffect, useMemo, useState } from 'react';
import { useApiClient } from '@/hooks/useApiClient';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/Skeleton';
import { ChevronRight } from 'lucide-react';
import {
  DriverScorecardOnePager,
  type OnePagerSnapshot,
} from './DriverScorecardOnePager';

interface WeekItem {
  weekStart: string;
  weekEnd: string;
  isUpcoming: boolean;
  sendCount: number;
}

interface WeeksResponse {
  enabled: boolean;
  sendHourEt: number;
  weeks: WeekItem[];
}

interface DriverPreview {
  driverContactId: string;
  driverName: string;
  phoneE164: string | null;
  email: string | null;
  enrolled: boolean;
  smsBodyPreview: string | null;
  status?: string;
  sentAt?: string;
  reportUrl?: string;
  snapshot: OnePagerSnapshot;
}

interface PreviewResponse {
  weekStart: string;
  weekEnd: string;
  isUpcoming: boolean;
  drivers: DriverPreview[];
}

function formatWeekRange(weekStart: string, isUpcoming: boolean): string {
  const [y, m, d] = weekStart.split('-').map(Number);
  const startUtc = new Date(Date.UTC(y, m - 1, d));
  const endUtc = new Date(startUtc.getTime() + 6 * 24 * 60 * 60 * 1000);
  const fmt = (dt: Date) =>
    dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `${isUpcoming ? 'Upcoming: ' : ''}${fmt(startUtc)} – ${fmt(endUtc)}`;
}

export function SmsPreviewView() {
  const { getApi } = useApiClient();
  const [loadingWeeks, setLoadingWeeks] = useState(true);
  const [weeks, setWeeks] = useState<WeekItem[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingWeeks(true);
        const api = await getApi();
        const res = await api.get<WeeksResponse>('/sms-reports/weeks');
        if (cancelled) return;
        setWeeks(res.weeks);
        setEnabled(res.enabled);
        if (res.weeks.length > 0) setSelectedWeek(res.weeks[0].weekStart);
      } finally {
        if (!cancelled) setLoadingWeeks(false);
      }
    })();
    return () => { cancelled = true; };
  }, [getApi]);

  useEffect(() => {
    if (!selectedWeek) return;
    let cancelled = false;
    (async () => {
      try {
        setLoadingPreview(true);
        const api = await getApi();
        const res = await api.get<PreviewResponse>(`/sms-reports/preview?weekStart=${selectedWeek}`);
        if (cancelled) return;
        setPreview(res);
        setSelectedDriverId(res.drivers[0]?.driverContactId ?? null);
      } finally {
        if (!cancelled) setLoadingPreview(false);
      }
    })();
    return () => { cancelled = true; };
  }, [getApi, selectedWeek]);

  const selectedDriver = useMemo(
    () => preview?.drivers.find((d) => d.driverContactId === selectedDriverId) ?? null,
    [preview, selectedDriverId],
  );
  const selectedWeekItem = useMemo(
    () => weeks.find((w) => w.weekStart === selectedWeek) ?? null,
    [weeks, selectedWeek],
  );

  const [togglingId, setTogglingId] = useState<string | null>(null);
  const toggleEnrollment = async (driverContactId: string, nextEnrolled: boolean) => {
    setTogglingId(driverContactId);
    // Optimistic update so the UI feels instant
    setPreview((p) => p ? { ...p, drivers: p.drivers.map((d) => d.driverContactId === driverContactId ? { ...d, enrolled: nextEnrolled } : d) } : p);
    try {
      const api = await getApi();
      await api.patch(`/sms-reports/drivers/${driverContactId}/enrollment` as any, { enrolled: nextEnrolled });
    } catch (e: any) {
      // Roll back on failure
      setPreview((p) => p ? { ...p, drivers: p.drivers.map((d) => d.driverContactId === driverContactId ? { ...d, enrolled: !nextEnrolled } : d) } : p);
      alert(`Failed: ${e.message ?? e}`);
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Week</span>
          {loadingWeeks ? (
            <Skeleton className="h-9 w-56" />
          ) : (
            <select
              value={selectedWeek ?? ''}
              onChange={(e) => setSelectedWeek(e.target.value)}
              className="h-9 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
            >
              {weeks.map((w) => (
                <option key={w.weekStart} value={w.weekStart}>
                  {formatWeekRange(w.weekStart, w.isUpcoming)}{w.sendCount > 0 ? ` (${w.sendCount} sends)` : ''}
                </option>
              ))}
            </select>
          )}
        </div>

        {!enabled && <Badge variant="outline">SMS not yet enabled for this org</Badge>}
        {selectedWeekItem?.isUpcoming && (
          <Badge variant="secondary">Live preview — built from current data</Badge>
        )}
      </div>

      {loadingPreview ? (
        <Skeleton className="h-96" />
      ) : !preview || preview.drivers.length === 0 ? (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          No drivers would receive a report this week. Check that enrolled drivers have phone numbers.
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[280px,1fr] gap-4">
          {/* Driver list — sorted by rank, top performer first */}
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="bg-muted px-3 py-2 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
              {preview.drivers.length} drivers · sorted by rank
            </div>
            <ul className="divide-y divide-border max-h-[70vh] overflow-y-auto">
              {preview.drivers.map((d) => {
                const isSelected = d.driverContactId === selectedDriverId;
                const excluded = !d.enrolled;
                return (
                  <li key={d.driverContactId}>
                    <button
                      onClick={() => setSelectedDriverId(d.driverContactId)}
                      className={`w-full text-left flex items-center gap-2 px-3 py-2.5 transition-colors cursor-pointer ${
                        excluded
                          ? isSelected
                            ? 'bg-rose-100'
                            : 'bg-rose-50 hover:bg-rose-100'
                          : isSelected
                          ? 'bg-primary/10'
                          : 'hover:bg-accent'
                      }`}
                    >
                      <span className={`text-xs font-mono w-6 ${excluded ? 'text-rose-400 line-through' : 'text-muted-foreground'}`}>
                        {d.snapshot.rank ?? '—'}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className={`block text-sm font-medium truncate ${excluded ? 'text-rose-700 line-through' : ''}`}>
                          {d.driverName}
                        </span>
                        <span className={`block text-[11px] truncate ${excluded ? 'text-rose-500' : 'text-muted-foreground'}`}>
                          {excluded
                            ? 'Excluded from send'
                            : `Score ${d.snapshot.current?.score ?? '—'} · MPG ${d.snapshot.current?.avgMpg?.toFixed?.(1) ?? '—'}`}
                        </span>
                      </span>
                      <ChevronRight className={`h-3.5 w-3.5 flex-shrink-0 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* The one-pager — exact same renderer the driver sees */}
          <div className="rounded-lg border border-border bg-slate-50 p-4">
            {selectedDriver ? (
              <>
                {/* Fleet-only header: contact info + enrollment toggle. */}
                <div className="mb-3 rounded border bg-white px-4 py-3 flex items-center gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{selectedDriver.driverName}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground mt-0.5">
                      <span>📞 {selectedDriver.phoneE164 ?? '(no phone)'}</span>
                      <span>✉ {selectedDriver.email ?? '(no email)'}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => toggleEnrollment(selectedDriver.driverContactId, !selectedDriver.enrolled)}
                    disabled={togglingId === selectedDriver.driverContactId}
                    className={`inline-flex items-center gap-2 h-8 px-3 rounded-md border text-xs font-medium transition-colors cursor-pointer ${
                      selectedDriver.enrolled
                        ? 'border-rose-300 text-rose-700 bg-white hover:bg-rose-50'
                        : 'border-emerald-300 text-emerald-700 bg-white hover:bg-emerald-50'
                    }`}
                  >
                    {selectedDriver.enrolled ? 'Exclude from send' : 'Include in send'}
                  </button>
                </div>

                {!selectedDriver.enrolled && (
                  <div className="mb-3 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                    This driver is currently excluded. They won't receive the Monday SMS. The preview below is what they <em>would</em> get if you re-enable them.
                  </div>
                )}

                {selectedDriver.smsBodyPreview && (
                  <div className="mb-4 rounded border bg-white px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">SMS body</p>
                    <p className="text-xs font-mono break-words">{selectedDriver.smsBodyPreview}</p>
                  </div>
                )}
                <DriverScorecardOnePager
                  weekStart={preview.weekStart}
                  snapshot={selectedDriver.snapshot}
                  sentAt={selectedDriver.sentAt}
                />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Select a driver to preview their scorecard.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
