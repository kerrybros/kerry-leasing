interface StatCardProps {
  icon: string;
  label: string;
  value: string | number;
  subtext?: string;
}

export function StatCard({ icon, label, value, subtext }: StatCardProps) {
  return (
    <div style={{
      background: 'var(--bg-primary)',
      borderRadius: 'var(--radius-md)',
      padding: 'var(--spacing-lg)',
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--spacing-md)',
      boxShadow: 'var(--shadow-sm)',
    }}>
      <div style={{
        fontSize: '2rem',
        width: '48px',
        height: '48px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-secondary)',
        borderRadius: 'var(--radius-md)',
      }}>
        {icon}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{
          fontSize: '0.875rem',
          color: 'var(--text-secondary)',
          marginBottom: '0.25rem',
        }}>
          {label}
        </div>
        <div style={{
          fontSize: '1.5rem',
          fontWeight: 600,
          color: 'var(--text-primary)',
        }}>
          {value}
        </div>
        {subtext && (
          <div style={{
            fontSize: '0.75rem',
            color: 'var(--text-tertiary)',
            marginTop: '0.25rem',
          }}>
            {subtext}
          </div>
        )}
      </div>
    </div>
  );
}
