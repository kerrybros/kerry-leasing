'use client';

import { useMemo, useRef, useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
            <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
            <XAxis
              dataKey="month"
              stroke="#888"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              padding={{ left: 20, right: 20 }}
            />
            <YAxis
              stroke="#888"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              domain={hasData ? ['auto', 'auto'] : [0, 100]}
              width={35}
            />
            <Tooltip
              contentStyle={{
                background: '#1a1a1a',
                border: '1px solid #333',
                borderRadius: '6px',
                color: '#ccc',
              }}
            />
            {hasData && (
              <Line
                type="monotone"
                dataKey={dataKey}
                stroke="#d9a528"
                strokeWidth={4}
                dot={{ fill: '#d9a528', r: 5, strokeWidth: 0 }}
                activeDot={{ r: 7 }}
              >
                <LabelList
                  dataKey={dataKey}
                  position="top"
                  offset={12}
                  formatter={labelFormatter}
                  style={{ fill: '#999', fontSize: '11px', fontWeight: 700 }}
                />
              </Line>
            )}
          </LineChart>
        </div>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ background: 'rgba(0,0,0,0.4)' }}>
            <span className="text-xs text-muted-foreground animate-pulse">Loading...</span>
          </div>
        )}
        {!loading && !hasData && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-sm font-medium" style={{ color: '#555' }}>No data available</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
