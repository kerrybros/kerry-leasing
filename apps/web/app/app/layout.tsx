'use client';

import { useEffect } from 'react';
import { UserButton, OrganizationSwitcher, useAuth } from '@clerk/nextjs';
import { ThemeToggle } from '@/components/ThemeToggle';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useApiClient } from '@/hooks/useApiClient';
import { useOrgSettings } from '@/hooks/useOrgSettings';
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
  SidebarRail,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Truck, Settings, Users } from 'lucide-react';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { has } = useAuth();
  const pathname = usePathname();
  const isAdmin = has && has({ role: 'org:admin' });
  const { getApi } = useApiClient();
  const { orgSettings, loadOrgSettings } = useOrgSettings(getApi);

  useEffect(() => {
    loadOrgSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      href: '/app/drivers',
      label: 'Drivers',
      icon: Users,
      active: !!pathname?.includes('/drivers'),
      hidden: !showDrivers,
    },
    {
      href: '/app/admin/service-plan',
      label: 'Admin',
      icon: Settings,
      active: !!pathname?.includes('/admin'),
      hidden: !isAdmin,
    },
  ].filter((item) => !item.hidden);

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        {/* Logo */}
        <SidebarHeader className="py-3 px-2">
          <Link href="/app/fleet" className="no-underline block">
            {/* Expanded logo */}
            <div className="group-data-[collapsible=icon]:hidden flex items-center px-2 py-1.5 bg-white rounded-lg">
              <Image
                src="/logos/Kerry Leasing Logo.png"
                alt="Kerry Leasing"
                width={152}
                height={52}
                className="h-8 w-auto object-contain"
                priority
              />
            </div>
            {/* Collapsed icon */}
            <div className="hidden group-data-[collapsible=icon]:flex items-center justify-center w-8 h-8 bg-white rounded-md">
              <span className="text-xs font-bold text-[#b8860b] leading-none">KL</span>
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
        </SidebarContent>

        {/* Footer: org switcher + user controls */}
        <SidebarFooter className="border-t border-sidebar-border pb-3">
          {/* OrganizationSwitcher — hidden when collapsed to icon mode */}
          <div className="group-data-[collapsible=icon]:hidden px-1 pt-1">
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

          {/* Theme + User — always visible */}
          <div className="flex items-center gap-1 px-1">
            <div className="group-data-[collapsible=icon]:hidden">
              <ThemeToggle />
            </div>
            <UserButton afterSignOutUrl="/sign-in" />
          </div>
        </SidebarFooter>

        <SidebarRail />
      </Sidebar>

      <SidebarInset>
        {/* Mobile top bar with hamburger trigger */}
        <header className="flex items-center h-12 px-4 border-b border-border bg-background lg:hidden sticky top-0 z-40">
          <SidebarTrigger />
          <div className="ml-3 flex items-center bg-white rounded-md px-2 py-1">
            <Image
              src="/logos/Kerry Leasing Logo.png"
              alt="Kerry Leasing"
              width={120}
              height={40}
              className="h-7 w-auto object-contain"
            />
          </div>
        </header>
        <main className="flex-1 min-h-0 min-w-0 overflow-auto">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
