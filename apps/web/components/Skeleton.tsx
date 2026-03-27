import { Skeleton as ShadcnSkeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export function Skeleton({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return <ShadcnSkeleton className={cn('h-full w-full', className)} style={style} />;
}

export function SkeletonLines({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={className} aria-busy="true">
      {Array.from({ length: lines }).map((_, i) => (
        <ShadcnSkeleton
          key={i}
          className="h-3 rounded"
          style={{
            marginTop: i === 0 ? 0 : 10,
            width: `${Math.max(30, 90 - i * 10)}%`,
          }}
        />
      ))}
    </div>
  );
}
