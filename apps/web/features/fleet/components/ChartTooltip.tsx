'use client';

/**
 * ChartTooltip — custom Recharts tooltip component.
 * Uses Tailwind classes so dark mode resolves correctly (CSS variables
 * in Recharts inline contentStyle are unreliable due to rendering context).
 *
 * Usage:
 *   <Tooltip content={<ChartTooltip />} />
 *   <Tooltip content={<ChartTooltip formatter={(v) => `${v}%`} />} />
 */
export function ChartTooltip({
  active,
  payload,
  label,
  formatter,
}: {
  active?: boolean;
  payload?: Array<{ value: unknown; name?: string; color?: string }>;
  label?: string;
  formatter?: (value: unknown, name?: string) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border border-border rounded px-2 py-1.5 text-[10px] text-popover-foreground shadow-md max-w-[200px]">
      {label && <p className="font-semibold mb-0.5 truncate">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color ?? 'inherit' }}>
          {formatter ? formatter(p.value, p.name) : String(p.value)}
        </p>
      ))}
    </div>
  );
}
