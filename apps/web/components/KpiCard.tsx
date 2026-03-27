import { Card, CardContent } from '@/components/ui/card';
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

export function KpiCard({ label, value, subtext, change, variant = 'default' }: KpiCardProps) {
  return (
    <Card className="flex flex-col justify-between">
      <CardContent className="pt-6 flex flex-col gap-1">
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className={cn('text-3xl font-bold leading-none', variantValueClass[variant])}>
          {value}
        </p>
        {subtext && (
          <p className="text-xs text-muted-foreground mt-1">{subtext}</p>
        )}
        {change && (
          <p className={cn('text-sm font-medium mt-1', change.positive ? 'text-[var(--success)]' : 'text-[var(--error)]')}>
            {change.positive ? '+' : ''}{change.value}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
