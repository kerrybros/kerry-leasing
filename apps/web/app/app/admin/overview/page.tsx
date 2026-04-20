'use client';

import Link from 'next/link';
import { CalendarClock, Settings, Wrench, Radio, AlertTriangle, CheckCircle } from 'lucide-react';
import { useOrgSettingsQuery, useServicePlanSummaryQuery } from '@/hooks/useDataQueries';
import { useOrganization } from '@clerk/nextjs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

function getRenewalDate(startDate: string | null, termYears: number | null): Date | null {
  if (!startDate || !termYears) return null;
  const start = new Date(startDate);
  // Renewal is the 1st of the month following the contract end date
  const end = new Date(start);
  end.setFullYear(end.getFullYear() + termYears);
  return new Date(end.getFullYear(), end.getMonth() + 1, 1);
}

function getDaysUntilRenewal(startDate: string | null, termYears: number | null): number | null {
  const renewal = getRenewalDate(startDate, termYears);
  if (!renewal) return null;
  const today = new Date();
  const diff = renewal.getTime() - today.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatRenewalDate(startDate: string | null, termYears: number | null): string {
  const renewal = getRenewalDate(startDate, termYears);
  if (!renewal) return '—';
  return renewal.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

const quickLinks = [
  { label: 'Customer Settings', href: '/app/admin/org-settings', icon: Settings, description: 'Customer info, contract term, service URL' },
  { label: 'Service Plan',      href: '/app/admin/service-plan',  icon: Wrench,   description: 'Units on the lease program' },
  { label: 'Telematics',        href: '/app/admin/telematics',    icon: Radio,    description: 'Telematics provider configuration' },
];

export default function AdminOverviewPage() {
  const { data: orgSettings, isLoading } = useOrgSettingsQuery();
  const { data: servicePlanData, isLoading: isPlanLoading } = useServicePlanSummaryQuery();
  const { organization } = useOrganization();

  const planSummary = servicePlanData?.summary;
  const unmatchedCount = planSummary?.unmatched ?? 0;

  const daysUntilRenewal = getDaysUntilRenewal(
    orgSettings?.contractStartDate ?? null,
    orgSettings?.contractTermYears ?? null
  );

  const renewalColor =
    daysUntilRenewal === null ? 'text-muted-foreground'
    : daysUntilRenewal < 30  ? 'text-destructive'
    : daysUntilRenewal < 90  ? 'text-amber-600 dark:text-amber-400'
    : 'text-green-600 dark:text-green-400';

  const renewalIcon =
    daysUntilRenewal === null ? null
    : daysUntilRenewal < 90 ? <AlertTriangle className="h-5 w-5" />
    : <CheckCircle className="h-5 w-5" />;

  return (
    <div className="mx-auto px-4 py-8 max-w-4xl flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold mb-1">Overview</h1>
        <p className="text-sm text-muted-foreground">
          Admin dashboard for <span className="font-semibold text-foreground">{organization?.name}</span>.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Contract Renewal Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="h-4 w-4" />
              Contract Renewal
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : !orgSettings?.contractStartDate || !orgSettings?.contractTermYears ? (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-muted-foreground">Contract term not configured.</p>
                <Link href="/app/admin/org-settings" className="text-sm text-primary underline-offset-4 hover:underline">
                  Configure in Customer Settings →
                </Link>
              </div>
            ) : (
              <div className="flex flex-col gap-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Start date</span>
                  <span className="font-medium">{formatDate(orgSettings.contractStartDate)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Term</span>
                  <span className="font-medium">{orgSettings.contractTermYears} year{orgSettings.contractTermYears !== 1 ? 's' : ''}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Renewal date</span>
                  <span className="font-medium">{formatRenewalDate(orgSettings.contractStartDate, orgSettings.contractTermYears)}</span>
                </div>
                <div className={`flex items-center gap-1.5 mt-2 font-semibold ${renewalColor}`}>
                  {renewalIcon}
                  {daysUntilRenewal !== null && (
                    <span>
                      {daysUntilRenewal > 0
                        ? `${daysUntilRenewal} days until renewal`
                        : `Renewal overdue by ${Math.abs(daysUntilRenewal)} days`}
                    </span>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Org Summary Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Org Summary</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : (
              <div className="flex flex-col gap-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Organization</span>
                  <span className="font-medium">{organization?.name ?? '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Telematics provider</span>
                  <span className="font-medium">{orgSettings?.telematicsProvider ?? 'Not configured'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Driver tracking</span>
                  <span className="font-medium">{orgSettings?.tracksDrivers ? 'Enabled' : 'Disabled'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Service request URL</span>
                  <span className="font-medium">{orgSettings?.serviceRequestUrl ? 'Configured' : 'Not set'}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Service Plan Status */}
      <Card className={unmatchedCount > 0 ? 'border-amber-400 dark:border-amber-500' : ''}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <Wrench className="h-4 w-4" />
              Service Plan
            </span>
            {unmatchedCount > 0 && (
              <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
                <AlertTriangle className="h-3 w-3" />
                {unmatchedCount} unit{unmatchedCount !== 1 ? 's' : ''} need attention
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isPlanLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : !planSummary ? (
            <p className="text-sm text-muted-foreground">No service plan data. <Link href="/app/admin/service-plan" className="text-primary hover:underline underline-offset-4">Set up service plan →</Link></p>
          ) : (
            <div className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total units</span>
                <span className="font-medium">{planSummary.total}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Matched</span>
                <span className="font-medium text-green-600 dark:text-green-400">{planSummary.matched}</span>
              </div>
              {unmatchedCount > 0 && (
                <div className="flex justify-between">
                  <span className="text-amber-600 dark:text-amber-400">Unmatched</span>
                  <span className="font-medium text-amber-600 dark:text-amber-400">{unmatchedCount}</span>
                </div>
              )}
              <div className="mt-1 pt-2 border-t border-border">
                <Link
                  href="/app/admin/service-plan"
                  className="text-xs text-primary hover:underline underline-offset-4"
                >
                  {unmatchedCount > 0 ? 'Review unmatched units →' : 'Manage service plan →'}
                </Link>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Links */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Quick Links</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {quickLinks.map((link) => {
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className="flex items-start gap-3 rounded-lg border border-border p-3 hover:bg-accent transition-colors no-underline"
                >
                  <Icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-foreground">{link.label}</p>
                    <p className="text-xs text-muted-foreground">{link.description}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
