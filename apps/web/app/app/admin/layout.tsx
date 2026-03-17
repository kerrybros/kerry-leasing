'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const adminTabs = [
  { label: 'Service Plan', href: '/app/admin/service-plan' },
  { label: 'Telematics', href: '/app/admin/telematics' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <>
      <div style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)', paddingTop: '0.5rem' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 1rem', display: 'flex', gap: '0.25rem' }}>
          {adminTabs.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className={`tab no-underline ${pathname === tab.href ? 'active' : ''}`}
              style={{ borderBottom: 'none', marginBottom: 0 }}
            >
              {tab.label}
            </Link>
          ))}
        </div>
      </div>
      {children}
    </>
  );
}
