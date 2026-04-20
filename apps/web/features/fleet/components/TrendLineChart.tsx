'use client';

import { useMemo, useRef, useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/Skeleton';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LabelList,
} from 'recharts';
import type { MonthlyMetrics } from '@/features/fleet/types';
import { CHART_COLORS, TOOLTIP_STYLE } from '@/features/fleet/utils/chartColors';

const PLACEHOLDER_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface TrendLineChartProps {
  title: string;
  dataKey: keyof MonthlyMetrics;
  data: MonthlyMetrics[];
  loading: boolean;
  labelFormatter?: (val: unknown) => string;
}

export function TrendLineChart({ title, dataKey, data, loading, labelFormatter }: TrendLineChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 600, h: 200 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width > 0 && height > 0) setDims({ w: Math.round(width), h: Math.round(height) });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const placeholderData = useMemo(
    () =>
      PLACEHOLDER_MONTHS.map((m) => ({
        month: m,
        monthKey: m,
        avgMpg: 0,
        totalMiles: 0,
        idlePercentage: 0,
        idleFuel: 0,
        idleTimeMinutes: 0,
        drivingFuel: 0,
      })) as unknown as MonthlyMetrics[],
    [],
  );

  const hasData = data.length > 0;
  const chartData = hasData ? data : placeholderData;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 relative">
        <div ref={containerRef} style={{ width: '100%', height: 200 }}>
          <LineChart width={dims.w} height={dims.h} data={chartData} margin={{ top: 20, right: 30, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
            <XAxis
              dataKey="month"
              stroke={CHART_COLORS.axis}
              fontSize={11}
              tickLine={false}
              axisLine={false}
              padding={{ left: 20, right: 20 }}
              tick={{ fill: CHART_COLORS.tick }}
            />
            <YAxis
              stroke={CHART_COLORS.axis}
              fontSize={11}
              tickLine={false}
              axisLine={false}
              domain={hasData ? ['auto', 'auto'] : [0, 100]}
              width={50}
              tick={{ fill: CHART_COLORS.tick }}
              tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}K` : v.toLocaleString()}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(v: unknown) => [typeof v === 'number' ? v.toLocaleString() : String(v)]}
            />
            {hasData && (
              <Line
                type="monotone"
                dataKey={dataKey}
                stroke={CHART_COLORS.primary}
                strokeWidth={4}
                dot={{ fill: CHART_COLORS.primary, r: 5, strokeWidth: 0 }}
                activeDot={{ r: 7 }}
              >
                <LabelList
                  dataKey={dataKey}
                  position="top"
                  offset={12}
                  formatter={labelFormatter}
                  style={{ fill: 'var(--foreground)', fontSize: '11px', fontWeight: 700 }}
                />
              </Line>
            )}
          </LineChart>
        </div>
        {loading && (
          <div className="absolute inset-0">
            <Skeleton style={{ height: '100%', borderRadius: 8 }} />
          </div>
        )}
        {!loading && !hasData && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-sm font-medium text-muted-foreground">No data available</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
