'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="h-[260px] pt-0">
        {children}
      </CardContent>
    </Card>
  );
}
