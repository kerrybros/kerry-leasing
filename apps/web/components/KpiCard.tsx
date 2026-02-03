interface KpiCardProps {
  label: string;
  value: string | number;
  change?: {
    value: string;
    positive: boolean;
  };
  variant?: 'primary' | 'success' | 'warning' | 'error';
}

export function KpiCard({ label, value, change, variant = 'primary' }: KpiCardProps) {
  return (
    <div className={`kpi-card ${variant}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {change && (
        <div className={`kpi-change ${change.positive ? 'positive' : 'negative'}`}>
          {change.positive ? '↑' : '↓'} {change.value}
        </div>
      )}
    </div>
  );
}
