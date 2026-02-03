interface EmptyStateProps {
  icon?: string;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ icon = '📭', title, description, action }: EmptyStateProps) {
  return (
    <div style={{
      textAlign: 'center',
      padding: 'var(--spacing-2xl)',
      background: 'var(--bg-secondary)',
      borderRadius: 'var(--radius-lg)',
    }}>
      <div style={{ fontSize: '3rem', marginBottom: 'var(--spacing-md)' }}>
        {icon}
      </div>
      <h3 style={{
        fontSize: '1.125rem',
        fontWeight: 600,
        color: 'var(--text-primary)',
        marginBottom: 'var(--spacing-sm)',
      }}>
        {title}
      </h3>
      <p style={{
        fontSize: '0.9375rem',
        color: 'var(--text-secondary)',
        marginBottom: action ? 'var(--spacing-lg)' : 0,
      }}>
        {description}
      </p>
      {action && (
        <button className="button" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}
