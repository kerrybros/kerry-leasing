'use client';

import React, { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import { UserButton, OrganizationSwitcher, useOrganization } from '@clerk/nextjs';
import { ThemeToggle } from '@/components/ThemeToggle';
import { OrgBrandTheme } from '@/components/OrgBrandTheme';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useOrgSettingsQuery } from '@/hooks/useDataQueries';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from '@/components/ui/sidebar';
import { Truck, Settings, Users, Building2, Activity, ClipboardCheck, Map, KeyRound, Lock, FileSpreadsheet } from 'lucide-react';

const defaultOrgSettings = {
  tracksDrivers: true,
  telematicsProvider: null as 'MOTIVE' | 'SAMSARA' | null,
  contractStartDate: null as string | null,
  serviceRequestUrl: null as string | null,
  contractTermYears: null as number | null,
  telematicsDashboardUrl: null as string | null,
  telematicsDashboardUsername: null as string | null,
  telematicsDashboardPassword: null as string | null,
};

const INTERNAL_SESSION_KEY = 'kl_internal_unlocked';
const INTERNAL_PIN = '5255';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: orgSettings = defaultOrgSettings } = useOrgSettingsQuery();
  const { organization } = useOrganization();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const showDrivers = orgSettings.tracksDrivers;
  const showServiceLog = organization?.id === 'org_39B7lu1b8YKds8IOtzrk6LpKnLW';

  // Session-gated internal access — cleared on hard refresh.
  // useLayoutEffect reads sessionStorage before first paint so there's no flash.
  const [isUnlocked, setIsUnlocked] = useState(false);
  useLayoutEffect(() => {
    setIsUnlocked(sessionStorage.getItem(INTERNAL_SESSION_KEY) === '1');
  }, []);

  // PIN dialog
  const [pinOpen, setPinOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const openPin = () => {
    setPin('');
    setPinError(false);
    setPinOpen(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const lock = () => {
    sessionStorage.removeItem(INTERNAL_SESSION_KEY);
    setIsUnlocked(false);
  };

  const handlePinChange = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 4);
    setPin(digits);
    setPinError(false);
    if (digits.length === 4) {
      if (digits === INTERNAL_PIN) {
        sessionStorage.setItem(INTERNAL_SESSION_KEY, '1');
        setIsUnlocked(true);
        setPinOpen(false);
        setPin('');
      } else {
        setPinError(true);
        setPin('');
        setTimeout(() => inputRef.current?.focus(), 0);
      }
    }
  };

  const navItems = useMemo(() => [
    {
      href: '/app/fleet',
      label: 'Fleet',
      icon: Truck,
      active: !!pathname?.includes('/fleet') || !!pathname?.includes('/units'),
    },
    {
      href: '/app/daily-service',
      label: 'Service Log',
      icon: FileSpreadsheet,
      active: !!pathname?.includes('/daily-service'),
      hidden: !showServiceLog,
    },
    {
      href: '/app/drivers',
      label: 'Scorecard',
      icon: Users,
      active: !!pathname?.includes('/drivers'),
      hidden: !showDrivers,
    },
    {
      href: '/app/whiparound',
      label: 'Whiparound',
      icon: ClipboardCheck,
      active: !!pathname?.includes('/whiparound'),
    },
    {
      href: '/app/idle-map',
      label: 'Idle Map',
      icon: Map,
      active: !!pathname?.includes('/idle-map'),
    },
    {
      href: '/app/team',
      label: 'Users',
      icon: Users,
      active: !!pathname?.includes('/team'),
    },
  ].filter((item) => !item.hidden), [pathname, isUnlocked, showDrivers, showServiceLog]);

  return (
    <SidebarProvider
      defaultOpen={true}
      style={{ "--sidebar-width": "10rem" } as React.CSSProperties}
    >
      <OrgBrandTheme />
      <Sidebar collapsible="none">
        {/* Logo */}
        <SidebarHeader className="py-3 px-2">
          <Link href="/app/fleet" className="no-underline block">
            <div className="bg-white rounded-lg px-3 py-2 flex flex-col items-center gap-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logos/Kerry Leasing Logo.png"
                alt="Kerry Leasing"
                style={{ height: 28, width: 'auto', display: 'block' }}
              />
              <div style={{ height: 1, width: '100%', background: '#e5e7eb' }} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logos/Kerry Brothers Truck Repair Logo Transpaent.png"
                alt="Kerry Brothers Truck Repair"
                style={{ height: 28, width: 'auto', display: 'block' }}
              />
            </div>
          </Link>
        </SidebarHeader>

        {/* Nav items */}
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      render={<Link href={item.href} />}
                      isActive={item.active}
                      className={item.active ? 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground' : ''}
                    >
                      <item.icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {/* Internal section — PIN-gated */}
          {isUnlocked && (
            <SidebarGroup className="mt-auto">
              <div className="px-3 pb-1">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">Internal</p>
              </div>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      render={<Link href="/app/admin/overview" />}
                      isActive={!!pathname?.includes('/admin') && !pathname?.includes('/admin/customers')}
                    >
                      <Settings />
                      <span>Admin</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      render={<Link href="/app/admin/customers" />}
                      isActive={!!pathname?.includes('/admin/customers')}
                    >
                      <Building2 />
                      <span>Customers</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      render={<Link href="/app/admin/cron-health" />}
                      isActive={!!pathname?.includes('/admin/cron-health')}
                    >
                      <Activity />
                      <span>Cron Health</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}

          {/* Service Request Button */}
          <div className="mt-auto px-3 pb-2">
            <a
              href={orgSettings.serviceRequestUrl || '#'}
              target={orgSettings.serviceRequestUrl ? '_blank' : undefined}
              rel={orgSettings.serviceRequestUrl ? 'noopener noreferrer' : undefined}
              onClick={orgSettings.serviceRequestUrl ? undefined : (e) => { e.preventDefault(); alert('No service request URL configured. Ask your admin to set one in Customer Settings.'); }}
              className="flex items-center justify-center rounded-md px-3 py-2 text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors w-full"
            >
              Request Service
            </a>
          </div>
        </SidebarContent>

        {/* Footer: org switcher + user controls */}
        <SidebarFooter className="border-t border-sidebar-border pb-3">
          <div className="px-1 pt-1">
            {mounted ? (
              <OrganizationSwitcher
                hidePersonal={true}
                afterSelectOrganizationUrl="/app/fleet"
                appearance={{
                  elements: {
                    rootBox: 'w-full',
                    organizationSwitcherTrigger:
                      'w-full justify-start rounded-md px-2 py-1.5 text-sm text-sidebar-foreground hover:bg-sidebar-accent transition-colors',
                  },
                }}
              />
            ) : (
              <div className="h-8 rounded-md bg-sidebar-accent/40" />
            )}
          </div>

          <div className="flex items-center gap-1 px-1 overflow-hidden">
            <ThemeToggle />
            {mounted ? (
              <div className="shrink-0 [&_button]:!w-7 [&_button]:!h-7 [&_img]:!w-7 [&_img]:!h-7">
                <UserButton afterSignOutUrl="/sign-in" />
              </div>
            ) : (
              <div className="shrink-0 w-7 h-7 rounded-full bg-sidebar-accent/40" />
            )}
            <button
              type="button"
              onClick={isUnlocked ? lock : openPin}
              title={isUnlocked ? 'Lock internal access' : 'Internal access'}
              className={`ml-auto shrink-0 rounded p-1 transition-colors hover:bg-sidebar-accent ${isUnlocked ? 'text-primary hover:text-destructive' : 'text-sidebar-foreground/20 hover:text-sidebar-foreground/50'}`}
            >
              {isUnlocked ? <Lock size={13} /> : <KeyRound size={13} />}
            </button>
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <main className="flex-1 min-h-0 min-w-0 overflow-auto">
          {children}
        </main>
      </SidebarInset>

      {/* PIN overlay */}
      {pinOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setPinOpen(false); }}
        >
          <div className="bg-background border border-border rounded-xl shadow-xl p-6 w-64 flex flex-col items-center gap-4">
            <KeyRound size={20} className="text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">Enter access code</p>
            <input
              ref={inputRef}
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={(e) => handlePinChange(e.target.value)}
              placeholder="····"
              className={`w-28 text-center text-2xl tracking-[0.5em] border rounded-lg px-3 py-2 bg-background outline-none transition-colors ${
                pinError
                  ? 'border-destructive text-destructive focus:border-destructive'
                  : 'border-border focus:border-primary'
              }`}
              autoComplete="off"
            />
            {pinError && (
              <p className="text-xs text-destructive -mt-2">Incorrect code</p>
            )}
            <button
              type="button"
              onClick={() => setPinOpen(false)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </SidebarProvider>
  );
}
