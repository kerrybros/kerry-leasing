'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const adminTabs = [
  { label: 'Overview',     href: '/app/admin/overview' },
  { label: 'Org Settings', href: '/app/admin/org-settings' },
  { label: 'Service Plan', href: '/app/admin/service-plan' },
  { label: 'Telematics',   href: '/app/admin/telematics' },
  { label: 'Whiparound',   href: '/app/admin/whiparound' },
  { label: 'SMS Reports',  href: '/app/admin/sms-reports' },
  { label: 'Documents',    href: '/app/admin/documents' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <>
      <div className="border-b border-border bg-muted pt-2">
        <div className="max-w-[1400px] mx-auto px-4 flex gap-1">
          {adminTabs.map((tab) => {
            const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`px-4 py-2 text-sm font-medium no-underline transition-colors cursor-pointer border-b-[3px] relative -bottom-0.5 ${
                  active
                    ? 'text-primary border-primary'
                    : 'text-muted-foreground border-transparent hover:text-foreground hover:bg-accent rounded-t-lg'
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </div>
      {children}
    </>
  );
}
