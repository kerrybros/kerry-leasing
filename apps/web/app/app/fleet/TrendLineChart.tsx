'use client';

import { Skeleton } from '@/components/Skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
} from 'recharts';
import type { MonthlyMetrics } from './types';

interface TrendLineChartProps {
  title: string;
  dataKey: keyof MonthlyMetrics;
  data: MonthlyMetrics[];
  loading: boolean;
  labelFormatter?: (val: unknown) => string;
}

export function TrendLineChart({ title, dataKey, data, loading, labelFormatter }: TrendLineChartProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="h-[240px] pt-0">
        {loading ? (
          <Skeleton style={{ height: '100%', borderRadius: 8 }} />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 20, right: 30, left: 30, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="month"
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                padding={{ left: 20, right: 20 }}
              />
              <YAxis
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                domain={['auto', 'auto']}
                width={40}
              />
              <Tooltip
                contentStyle={{
                  background: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px',
                }}
              />
              <Line
                type="monotone"
                dataKey={dataKey}
                stroke="#d9a528"
                strokeWidth={5}
                dot={{ fill: '#d9a528', r: 6, strokeWidth: 0 }}
                activeDot={{ r: 8 }}
              >
                <LabelList
                  dataKey={dataKey}
                  position="top"
                  offset={12}
                  formatter={labelFormatter}
                  style={{ fill: 'hsl(var(--muted-foreground))', fontSize: '12px', fontWeight: 700 }}
                />
              </Line>
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
