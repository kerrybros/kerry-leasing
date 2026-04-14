'use client';

import { useQuery } from '@tanstack/react-query';
import { useApiClient } from '@/hooks/useApiClient';
import { useOrganization } from '@clerk/nextjs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/Skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList,
} from 'recharts';
import { CHART_COLORS, TOOLTIP_STYLE } from '@/features/fleet/utils/chartColors';

interface IdleEvent {
  id: string;
  unitNumber: string | null;
  vin: string | null;
  startTime: string;
  date: string;
  durationMinutes: number | null;
  idleFuelGallons: number | null;
  lat: number | null;
  lon: number | null;
  location: string | null;
}

interface RepeatOffender {
  unitNumber: string;
  count: number;
  totalMinutes: number;
  totalFuel: number;
}

interface IdleEventsResponse {
  provider: 'MOTIVE' | 'SAMSARA' | null;
  totalEvents: number;
  totalIdleMinutes: number;
  totalIdleFuel: number;
  repeatOffenders: RepeatOffender[];
  longestEvents: IdleEvent[];
  events: IdleEvent[];
}

function formatDuration(minutes: number | null): string {
  if (minutes == null) return '—';
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export default function IdleEventsPage() {
  const { organization } = useOrganization();
  const { getApi } = useApiClient();

  const { data, isLoading, error } = useQuery<IdleEventsResponse>({
    queryKey: ['idle-events', organization?.id],
    queryFn: async () => {
      const api = await getApi();
      return api.get<IdleEventsResponse>('/fleet/idle-events');
    },
    enabled: !!organization?.id,
  });

  if (isLoading) {
    return (
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8 flex flex-col gap-4">
        <Skeleton style={{ height: 36, width: '30%', borderRadius: 8 }} />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} style={{ height: 90, borderRadius: 8 }} />)}
        </div>
        <Skeleton style={{ height: 300, borderRadius: 8 }} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-3xl font-bold mb-2">Idle Events</h1>
        <p className="text-muted-foreground text-sm">{error ? (error as Error).message : 'No data available.'}</p>
      </div>
    );
  }

  const hasLocations = data.events.some(e => e.lat != null && e.lon != null);

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8 flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-1">Idle Events</h1>
          <p className="text-sm text-muted-foreground">
            {organization?.name}
            {data.provider && (
              <Badge variant="outline" className="ml-2 text-xs">{data.provider}</Badge>
            )}
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Total Events</p>
          <p className="text-2xl font-bold text-foreground">{data.totalEvents.toLocaleString()}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Total Idle Time</p>
          <p className="text-2xl font-bold text-foreground">{formatDuration(data.totalIdleMinutes)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{Math.round(data.totalIdleMinutes / 60)} hours total</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Idle Fuel Used</p>
          <p className="text-2xl font-bold text-foreground">{data.totalIdleFuel.toFixed(1)} gal</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Repeat Offenders */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Repeat Offenders — Most Idle Events
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.repeatOffenders.length === 0 ? (
              <p className="text-muted-foreground text-sm">No idle events found.</p>
            ) : (
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={data.repeatOffenders.slice(0, 8)}
                    layout="vertical"
                    margin={{ top: 4, right: 50, left: 8, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} horizontal={false} />
                    <XAxis
                      type="number"
                      stroke={CHART_COLORS.axis}
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: CHART_COLORS.tick }}
                    />
                    <YAxis
                      type="category"
                      dataKey="unitNumber"
                      width={70}
                      stroke={CHART_COLORS.axis}
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: CHART_COLORS.tick }}
                    />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(v: unknown, name: string | undefined) => [
                        name === 'count' ? `${v} events` : formatDuration(v as number),
                        name === 'count' ? 'Events' : 'Total Idle',
                      ]}
                    />
                    <Bar dataKey="count" fill={CHART_COLORS.warning} radius={[0, 3, 3, 0]} isAnimationActive={false}>
                      <LabelList
                        dataKey="count"
                        position="right"
                        style={{ fill: CHART_COLORS.tick, fontSize: 11 }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Longest Idle Events */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Longest Idle Events
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted hover:bg-muted">
                  <TableHead className="text-muted-foreground font-semibold uppercase tracking-wide text-xs">Unit</TableHead>
                  <TableHead className="text-muted-foreground font-semibold uppercase tracking-wide text-xs">Date</TableHead>
                  <TableHead className="text-muted-foreground font-semibold uppercase tracking-wide text-xs">Duration</TableHead>
                  <TableHead className="text-muted-foreground font-semibold uppercase tracking-wide text-xs">Fuel</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.longestEvents.map(e => (
                  <TableRow key={e.id}>
                    <TableCell className="text-sm font-medium">{e.unitNumber ?? '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(e.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </TableCell>
                    <TableCell>
                      <span className={`text-sm font-semibold ${(e.durationMinutes ?? 0) > 120 ? 'text-destructive' : (e.durationMinutes ?? 0) > 60 ? 'text-amber-600 dark:text-amber-400' : 'text-foreground'}`}>
                        {formatDuration(e.durationMinutes)}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {e.idleFuelGallons != null ? `${e.idleFuelGallons.toFixed(2)} gal` : '—'}
                    </TableCell>
                  </TableRow>
                ))}
                {data.longestEvents.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-6">No data</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* All Events Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            All Idle Events <span className="font-normal text-muted-foreground">(up to 500)</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted hover:bg-muted">
                  <TableHead className="text-muted-foreground font-semibold uppercase tracking-wide text-xs">Unit</TableHead>
                  <TableHead className="text-muted-foreground font-semibold uppercase tracking-wide text-xs">Date</TableHead>
                  <TableHead className="text-muted-foreground font-semibold uppercase tracking-wide text-xs">Start Time</TableHead>
                  <TableHead className="text-muted-foreground font-semibold uppercase tracking-wide text-xs">Duration</TableHead>
                  <TableHead className="text-muted-foreground font-semibold uppercase tracking-wide text-xs">Fuel</TableHead>
                  {hasLocations && <TableHead className="text-muted-foreground font-semibold uppercase tracking-wide text-xs">Location</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.events.map(e => (
                  <TableRow key={e.id} className="hover:bg-accent/50">
                    <TableCell className="text-sm font-medium">{e.unitNumber ?? '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(e.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(e.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </TableCell>
                    <TableCell>
                      <span className={`text-sm ${(e.durationMinutes ?? 0) > 120 ? 'text-destructive font-semibold' : (e.durationMinutes ?? 0) > 60 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}>
                        {formatDuration(e.durationMinutes)}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {e.idleFuelGallons != null ? `${e.idleFuelGallons.toFixed(2)} gal` : '—'}
                    </TableCell>
                    {hasLocations && (
                      <TableCell className="text-xs text-muted-foreground">{e.location ?? '—'}</TableCell>
                    )}
                  </TableRow>
                ))}
                {data.events.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={hasLocations ? 6 : 5} className="text-center text-muted-foreground py-8">
                      No idle events found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
