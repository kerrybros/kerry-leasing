'use client';

import { UserButton, OrganizationSwitcher, useAuth } from '@clerk/nextjs';
import { ThemeToggle } from '@/components/ThemeToggle';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { has } = useAuth();
  const pathname = usePathname();
  const isAdmin = has && has({ role: 'org:admin' });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen">
      <nav className="bg-bg-secondary shadow-md border-b border-border sticky top-0 z-50">
        <div className="px-4 sm:px-6 lg:px-8 py-2">
          <div className="flex justify-between items-center">
            {/* Left side: Logos + Action buttons */}
            <div className="flex items-center gap-4">
              {/* Mobile menu button */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="lg:hidden p-2 rounded-lg bg-bg-tertiary border border-border text-text-primary hover:bg-bg-hover transition-colors"
                aria-label="Toggle menu"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {mobileMenuOpen ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  )}
                </svg>
              </button>

              {/* Logos */}
              <Link href="/app" className="no-underline">
                <div className="flex items-center gap-2 sm:gap-4 px-2 py-0.5 bg-white rounded-lg cursor-pointer">
                  <Image
                    src="/logos/Kerry Leasing Logo.png"
                    alt="Kerry Leasing"
                    width={220}
                    height={75}
                    className="h-10 sm:h-12 md:h-16 w-auto object-contain"
                  />
                  <div className="w-px h-10 sm:h-12 md:h-16 bg-gray-200" />
                  <Image
                    src="/logos/Kerry Brothers Truck Repair Logo Transpaent.png"
                    alt="Kerry Brothers Truck Repair"
                    width={280}
                    height={95}
                    className="h-12 sm:h-14 md:h-20 w-auto object-contain"
                  />
                </div>
              </Link>
            </div>

            {/* Desktop navigation */}
            <div className="hidden lg:flex items-center gap-6">
              <Link
                href="/app/fleet"
                className={`no-underline text-base font-medium transition-colors ${
                  pathname?.includes('/fleet') 
                    ? 'text-primary font-bold' 
                    : 'text-text-primary hover:text-primary'
                }`}
              >
                Fleet
              </Link>

              <ThemeToggle />
              <OrganizationSwitcher 
                hidePersonal={true}
                afterSelectOrganizationUrl="/app/fleet"
              />
              <UserButton afterSignOutUrl="/sign-in" />
            </div>

            {/* Mobile right side - just theme toggle and user */}
            <div className="flex lg:hidden items-center gap-3">
              <ThemeToggle />
              <UserButton afterSignOutUrl="/sign-in" />
            </div>
          </div>

          {/* Mobile menu */}
          {mobileMenuOpen && (
            <div className="lg:hidden mt-4 pb-4 border-t border-border pt-4 space-y-3">
              <Link
                href="/app/fleet"
                onClick={() => setMobileMenuOpen(false)}
                className={`block px-4 py-3 rounded-lg no-underline text-base font-medium transition-colors ${
                  pathname?.includes('/fleet')
                    ? 'bg-primary text-white'
                    : 'bg-bg-tertiary text-text-primary hover:bg-bg-hover'
                }`}
              >
                Fleet
              </Link>

              <div className="px-4 pt-2">
                <OrganizationSwitcher 
                  hidePersonal={true}
                  afterSelectOrganizationUrl="/app/fleet"
                />
              </div>
            </div>
          )}
        </div>
      </nav>
      <main>{children}</main>
    </div>
  );
}
