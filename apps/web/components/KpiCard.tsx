import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/Skeleton';
import { cn } from '@/lib/utils';

interface KpiCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  change?: {
    value: string;
    positive: boolean;
  };
  variant?: 'default' | 'warning' | 'error' | 'success';
}

const variantValueClass: Record<NonNullable<KpiCardProps['variant']>, string> = {
  default: 'text-foreground',
  warning: 'text-[var(--warning)]',
  error: 'text-[var(--error)]',
  success: 'text-[var(--success)]',
};

export function SkeletonKpiCard() {
  return (
    <Card className="py-0 h-full">
      <CardContent className="h-full py-2.5 px-3 flex flex-col items-center justify-center gap-0">
        <Skeleton style={{ height: 10, width: '55%', borderRadius: 8 }} />
        <Skeleton style={{ height: 22, width: '70%', borderRadius: 8, marginTop: 4 }} />
        <Skeleton style={{ height: 9, width: '35%', borderRadius: 8, marginTop: 3 }} />
      </CardContent>
    </Card>
  );
}

export function KpiCard({ label, value, subtext, change, variant = 'default' }: KpiCardProps) {
  return (
    <Card className="py-0 h-full">
      <CardContent className="h-full py-2.5 px-3 flex flex-col items-center justify-center text-center gap-0">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground leading-tight">
          {label}
        </p>
        <p className={cn('text-lg font-bold leading-snug', variantValueClass[variant])}>
          {value}
        </p>
        {subtext && (
          <p className="text-[10px] text-muted-foreground leading-none">{subtext}</p>
        )}
        {change && (
          <p className={cn('text-[10px] font-medium leading-tight', change.positive ? 'text-[var(--success)]' : 'text-[var(--error)]')}>
            {change.positive ? '+' : ''}{change.value}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
