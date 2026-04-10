'use client';

import { useRouter } from 'next/navigation';
import { useOrganization } from '@clerk/nextjs';
import Papa from 'papaparse';
import { useDriversData } from '@/features/drivers/hooks/useDriversData';
import { scoreVariant } from '@/lib/driverScore';
import { Skeleton } from '@/components/Skeleton';
import { EmptyState } from '@/components/EmptyState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { DriverRow } from '@/features/drivers/types';

function downloadCsv(rows: DriverRow[], orgName: string) {
  const data = rows.map(r => ({
    Driver: r.driverName,
    Miles: Math.round(r.totalMiles),
    MPG: r.avgMpg.toFixed(2),
    'Idle %': r.idlePct.toFixed(2),
    'Idle Fuel (gal)': Math.round(r.idleFuelGal),
    'Total Fuel (gal)': Math.round(r.totalFuelGal),
    'Est. Fuel Cost': r.estimatedFuelCost,
    Score: r.score,
  }));
  const csv = Papa.unparse(data);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `driver-scorecard-${orgName.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function scoreBadgeVariant(variant: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (variant === 'success') return 'default';
  if (variant === 'warning') return 'secondary';
  return 'destructive';
}

export default function DriversPage() {
  const router = useRouter();
  const { organization } = useOrganization();
  const { orgSettingsQuery, canShow, isMotive, tracksDrivers, driverRows, isLoading } = useDriversData();

  if (orgSettingsQuery.isLoading) {
    return (
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 p-6">
        <Skeleton style={{ height: 300, borderRadius: 8, marginTop: 24 }} />
      </div>
    );
  }

  if (!canShow) {
    return (
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 p-6 pt-8">
        <EmptyState
          title="Driver Scorecard Unavailable"
          description={
            !isMotive
              ? 'Driver scoring requires a Motive telematics integration. Samsara does not provide per-driver data.'
              : 'Driver tracking is not enabled for this organization. Enable it in Org Settings.'
          }
        />
      </div>
    );
  }

  const topIds = new Set(driverRows.slice(0, 3).map(r => r.driverId));
  const bottomIds = new Set(driverRows.slice(-3).map(r => r.driverId));

  return (
    <div className="w-full p-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold mb-1">Driver Scorecard</h1>
          <p className="text-muted-foreground text-sm">{organization?.name}</p>
        </div>
        <Button
          variant="outline"
          onClick={() => downloadCsv(driverRows, organization?.name || 'fleet')}
          disabled={driverRows.length === 0}
        >
          Export CSV
        </Button>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-1">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} style={{ height: 44, borderRadius: 4 }} />
          ))}
        </div>
      ) : driverRows.length === 0 ? (
        <EmptyState
          title="No Driver Data"
          description="No driver utilization records found. Ensure telematics data has been synced."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted hover:bg-muted">
                <TableHead className="text-muted-foreground font-semibold uppercase tracking-wide text-xs">#</TableHead>
                <TableHead className="text-muted-foreground font-semibold uppercase tracking-wide text-xs">Driver</TableHead>
                <TableHead className="text-muted-foreground font-semibold uppercase tracking-wide text-xs">Miles</TableHead>
                <TableHead className="text-muted-foreground font-semibold uppercase tracking-wide text-xs">MPG</TableHead>
                <TableHead className="text-muted-foreground font-semibold uppercase tracking-wide text-xs">Idle %</TableHead>
                <TableHead className="text-muted-foreground font-semibold uppercase tracking-wide text-xs">Idle Fuel (gal)</TableHead>
                <TableHead className="text-muted-foreground font-semibold uppercase tracking-wide text-xs">Total Fuel (gal)</TableHead>
                <TableHead className="text-muted-foreground font-semibold uppercase tracking-wide text-xs">Est. Fuel Cost</TableHead>
                <TableHead className="text-muted-foreground font-semibold uppercase tracking-wide text-xs">Score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {driverRows.map((row, idx) => {
                const variant = scoreVariant(row.score);
                const isTop = topIds.has(row.driverId) && driverRows.length > 3;
                const isBottom = bottomIds.has(row.driverId) && driverRows.length > 3;
                return (
                  <TableRow
                    key={row.driverId}
                    className="cursor-pointer hover:bg-accent/50 transition-colors"
                    style={{
                      borderLeft: isTop
                        ? '3px solid #22c55e'
                        : isBottom
                        ? '3px solid #ef4444'
                        : '3px solid transparent',
                    }}
                    onClick={() => router.push(`/app/drivers/${row.driverId}`)}
                  >
                    <TableCell className="text-muted-foreground text-xs font-mono w-8">{idx + 1}</TableCell>
                    <TableCell className="font-semibold">{row.driverName}</TableCell>
                    <TableCell>{Math.round(row.totalMiles).toLocaleString()}</TableCell>
                    <TableCell>{row.avgMpg.toFixed(2)}</TableCell>
                    <TableCell className="font-semibold">{row.idlePct.toFixed(2)}%</TableCell>
                    <TableCell>{Math.round(row.idleFuelGal).toLocaleString()}</TableCell>
                    <TableCell>{Math.round(row.totalFuelGal).toLocaleString()}</TableCell>
                    <TableCell>${row.estimatedFuelCost.toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge variant={scoreBadgeVariant(variant)} className="font-bold tabular-nums">
                        {row.score}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {driverRows.length > 3 && (
        <div className="flex items-center gap-6 mt-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-green-500"></span>
            Top 3 performers
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-red-500"></span>
            Bottom 3 performers
          </span>
        </div>
      )}
    </div>
  );
}
