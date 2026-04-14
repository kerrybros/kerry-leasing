'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { UserButton, OrganizationSwitcher, useAuth } from '@clerk/nextjs';
import { ThemeToggle } from '@/components/ThemeToggle';
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
import { Truck, Settings, Users, Wrench, CalendarClock, MessageSquare, Building2, Activity, ClipboardCheck, Map } from 'lucide-react';

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

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { has } = useAuth();
  const pathname = usePathname();
  const isAdmin = has && has({ role: 'org:admin' });
  const { data: orgSettings = defaultOrgSettings } = useOrgSettingsQuery();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const showDrivers = orgSettings.tracksDrivers;

  const navItems = useMemo(() => [
    {
      href: '/app/fleet',
      label: 'Fleet',
      icon: Truck,
      active: !!pathname?.includes('/fleet') || !!pathname?.includes('/units'),
    },
    {
      href: '/app/wip',
      label: 'Shop',
      icon: Wrench,
      active: !!pathname?.includes('/wip'),
      hidden: !isAdmin,
    },
    {
      href: '/app/pm',
      label: 'PM',
      icon: CalendarClock,
      active: !!pathname?.includes('/pm'),
      hidden: !isAdmin,
    },
    {
      href: '/app/chat',
      label: 'Chat',
      icon: MessageSquare,
      active: !!pathname?.includes('/chat'),
      hidden: !isAdmin,
    },
    {
      href: '/app/drivers',
      label: 'Scorecard',
      icon: Users,
      active: !!pathname?.includes('/drivers'),
      hidden: !showDrivers,
    },
    {
      href: '/app/team',
      label: 'Users',
      icon: Users,
      active: !!pathname?.includes('/team'),
    },
    {
      href: '/app/whiparound',
      label: 'Whiparound',
      icon: ClipboardCheck,
      active: !!pathname?.includes('/whiparound'),
      hidden: !isAdmin,
    },
    {
      href: '/app/idle-map',
      label: 'Idle Map',
      icon: Map,
      active: !!pathname?.includes('/idle-map'),
      hidden: !isAdmin,
    },
  ].filter((item) => !item.hidden), [pathname, isAdmin, showDrivers]);

  return (
    <SidebarProvider
      defaultOpen={true}
      style={{ "--sidebar-width": "10rem" } as React.CSSProperties}
    >
      <Sidebar collapsible="none">
        {/* Logo — full logo when expanded, small "KL" square when collapsed */}
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
                    >
                      <item.icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {/* Internal section — KL-admin only */}
          {isAdmin && (
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

          {/* Service Request Button — pinned to bottom of body */}
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
          {mounted && (
            <div className="px-1 pt-1">
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
            </div>
          )}

          <div className="flex items-center gap-1 px-1 overflow-hidden">
            <ThemeToggle />
            {mounted && (
              <div className="shrink-0 [&_button]:!w-7 [&_button]:!h-7 [&_img]:!w-7 [&_img]:!h-7">
                <UserButton afterSignOutUrl="/sign-in" />
              </div>
            )}
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <main className="flex-1 min-h-0 min-w-0 overflow-auto">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
