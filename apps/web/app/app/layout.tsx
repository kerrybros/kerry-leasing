'use client';

import React, { useState, useEffect } from 'react';
import { UserButton, OrganizationSwitcher, useAuth } from '@clerk/nextjs';
import { ThemeToggle } from '@/components/ThemeToggle';
import Image from 'next/image';
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
import { Truck, Settings, Users, Wrench, CalendarClock, MessageSquare } from 'lucide-react';

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

  const showDrivers =
    orgSettings.tracksDrivers && orgSettings.telematicsProvider === 'MOTIVE';

  const navItems = [
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
    },
    {
      href: '/app/pm',
      label: 'PM',
      icon: CalendarClock,
      active: !!pathname?.includes('/pm'),
    },
    {
      href: '/app/chat',
      label: 'Chat',
      icon: MessageSquare,
      active: !!pathname?.includes('/chat'),
    },
    {
      href: '/app/drivers',
      label: 'Drivers',
      icon: Users,
      active: !!pathname?.includes('/drivers'),
      hidden: !showDrivers,
    },
    {
      href: '/app/admin/overview',
      label: 'Admin',
      icon: Settings,
      active: !!pathname?.includes('/admin'),
      hidden: !isAdmin,
    },
  ].filter((item) => !item.hidden);

  return (
    <SidebarProvider style={{ "--sidebar-width": "11rem" } as React.CSSProperties}>
      <Sidebar collapsible="none">
        {/* Logo */}
        <SidebarHeader className="py-3 px-3">
          <Link href="/app/fleet" className="no-underline block">
            <div className="flex items-center px-2 py-1.5 bg-white rounded-lg">
              <Image
                src="/logos/Kerry Leasing Logo.png"
                alt="Kerry Leasing"
                width={120}
                height={40}
                className="h-7 w-auto object-contain"
                priority
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
                      tooltip={item.label}
                    >
                      <item.icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {/* Service Request Button — pinned to bottom of body */}
          <div className="mt-auto px-3 pb-2">
            <a
              href={orgSettings.serviceRequestUrl || '#'}
              target={orgSettings.serviceRequestUrl ? '_blank' : undefined}
              rel={orgSettings.serviceRequestUrl ? 'noopener noreferrer' : undefined}
              onClick={orgSettings.serviceRequestUrl ? undefined : (e) => { e.preventDefault(); alert('No service request URL configured. Ask your admin to set one in Org Settings.'); }}
              className="flex items-center justify-center rounded-md px-3 py-2 text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors w-full"
            >
              Submit Service Request
            </a>
          </div>
        </SidebarContent>

        {/* Footer: org switcher + user controls */}
        <SidebarFooter className="border-t border-sidebar-border pb-3">

          {/* OrganizationSwitcher — only render after hydration to avoid portal mismatch */}
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

          {/* Theme + User */}
          <div className="flex items-center gap-1 px-1">
            <ThemeToggle />
            {mounted && <UserButton afterSignOutUrl="/sign-in" />}
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
