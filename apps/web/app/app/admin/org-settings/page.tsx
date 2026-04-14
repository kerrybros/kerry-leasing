'use client';

import { useOrganization } from '@clerk/nextjs';
import { useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useApiClient } from '@/hooks/useApiClient';
import { useOrgSettingsQuery } from '@/hooks/useDataQueries';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/Skeleton';

interface RepairCustomerConfig {
  klOrgId: string;
  customerName: string;
  contractStartDate: string;
  updatedAt: string;
}

function formatRenewalDate(startDate: string | null, termYears: number | null): string | null {
  if (!startDate || !termYears) return null;
  const start = new Date(startDate);
  const renewal = new Date(start);
  renewal.setFullYear(renewal.getFullYear() + termYears);
  return renewal.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export default function AdminOrgSettingsPage() {
  const { organization } = useOrganization();
  const { getApi } = useApiClient();
  const { data: orgSettings } = useOrgSettingsQuery();
  const queryClient = useQueryClient();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingPortal, setSavingPortal] = useState(false);

  // Feature flags
  const [tracksDrivers, setTracksDrivers] = useState(true);

  // Section 1: Customer Info
  const [customerName, setCustomerName] = useState('');
  const [contractStartDate, setContractStartDate] = useState('');

  // Section 2: Contract Term
  const [contractTermYears, setContractTermYears] = useState<string>('');

  // Section 3: Service Request URL
  const [serviceRequestUrl, setServiceRequestUrl] = useState('');

  // Section 4: Telematics Dashboard Credentials
  const [telematicsDashboardUrl, setTelematicsDashboardUrl] = useState('');
  const [telematicsDashboardUsername, setTelematicsDashboardUsername] = useState('');
  const [telematicsDashboardPassword, setTelematicsDashboardPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [customerStatusMsg, setCustomerStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [portalStatusMsg, setPortalStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!organization?.id) return;
    loadConfig();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organization?.id]);

  useEffect(() => {
    if (!orgSettings) return;
    setTracksDrivers(orgSettings.tracksDrivers ?? true);
    setContractTermYears(orgSettings.contractTermYears?.toString() ?? '');
    setServiceRequestUrl(orgSettings.serviceRequestUrl ?? '');
    setTelematicsDashboardUrl(orgSettings.telematicsDashboardUrl ?? '');
    setTelematicsDashboardUsername(orgSettings.telematicsDashboardUsername ?? '');
    setTelematicsDashboardPassword(orgSettings.telematicsDashboardPassword ?? '');
  }, [orgSettings]);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const api = await getApi();
      const res = await api.get<{ config: RepairCustomerConfig | null }>('/admin/repair-customer');
      const config = res?.config ?? null;
      setCustomerName(config?.customerName ?? '');
      setContractStartDate(config?.contractStartDate ?? '');
    } catch (err: unknown) {
      setCustomerStatusMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed to load settings' });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = (customerName ?? '').trim();
    if (!organization?.id || !name || !contractStartDate) return;
    try {
      setSaving(true);
      setCustomerStatusMsg(null);
      const api = await getApi();
      await api.put('/admin/repair-customer', { customerName: name, contractStartDate });
      await queryClient.invalidateQueries({ queryKey: ['org-settings', organization?.id] });
      setCustomerStatusMsg({ type: 'success', text: 'Customer info saved.' });
      setTimeout(() => setCustomerStatusMsg(null), 5000);
    } catch (err: unknown) {
      setCustomerStatusMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save' });
    } finally {
      setSaving(false);
    }
  };

  const handleSavePortalSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSavingPortal(true);
      setPortalStatusMsg(null);
      const api = await getApi();
      await api.put('/admin/org-settings', {
        tracksDrivers,
        contractTermYears: contractTermYears ? parseInt(contractTermYears, 10) : null,
        serviceRequestUrl: serviceRequestUrl.trim() || null,
        telematicsDashboardUrl: telematicsDashboardUrl.trim() || null,
        telematicsDashboardUsername: telematicsDashboardUsername.trim() || null,
        telematicsDashboardPassword: telematicsDashboardPassword || null,
      });
      await queryClient.invalidateQueries({ queryKey: ['org-settings', organization?.id] });
      setPortalStatusMsg({ type: 'success', text: 'Settings saved.' });
      setTimeout(() => setPortalStatusMsg(null), 5000);
    } catch (err: unknown) {
      setPortalStatusMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save' });
    } finally {
      setSavingPortal(false);
    }
  };

  const renewalDate = formatRenewalDate(
    contractStartDate || orgSettings?.contractStartDate || null,
    contractTermYears ? parseInt(contractTermYears, 10) : orgSettings?.contractTermYears ?? null
  );

  if (loading) {
    return (
      <div className="mx-auto px-4 py-8 max-w-2xl flex flex-col gap-4">
        <Skeleton style={{ height: 32, width: '40%', borderRadius: 8 }} />
        <Skeleton style={{ height: 200, borderRadius: 8 }} />
        <Skeleton style={{ height: 200, borderRadius: 8 }} />
      </div>
    );
  }

  return (
    <div className="mx-auto px-4 py-8 max-w-2xl flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold mb-1">Customer Settings</h1>
        <p className="text-sm text-muted-foreground">
          Configuration for <span className="font-semibold text-foreground">{organization?.name}</span>.
        </p>
      </div>

      {/* Section 1 + 2: Customer Info & Contract Term */}
      <Card>
        <CardHeader>
          <CardTitle>Customer Info</CardTitle>
          <CardDescription>Customer name, contract start date, and term length.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveCustomer} className="flex flex-col gap-5">
            <div>
              <label className="text-sm font-medium mb-2 block">Customer Name</label>
              <Input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="e.g. Wolverine"
                required
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Contract Start Date</label>
              <Input
                type="date"
                value={contractStartDate}
                onChange={(e) => setContractStartDate(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground mt-1">
                Used as the start of the data range for repairs and telematics.
              </p>
            </div>

            <div className="flex items-center gap-4">
              <Button type="submit" disabled={saving || !customerName.trim() || !contractStartDate}>
                {saving ? 'Saving...' : 'Save Customer Info'}
              </Button>
              {customerStatusMsg && (
                <p className={`text-sm ${customerStatusMsg.type === 'success' ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
                  {customerStatusMsg.text}
                </p>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Portal Settings */}
      <form onSubmit={handleSavePortalSettings} className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Feature Flags</CardTitle>
            <CardDescription>Toggle organization-wide features.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Track Driver Data</p>
                <p className="text-xs text-muted-foreground">
                  Show the Driver Scorecard and per-driver metrics in the sidebar and fleet views.
                </p>
              </div>
              <Switch checked={tracksDrivers} onCheckedChange={setTracksDrivers} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Contract Term</CardTitle>
            <CardDescription>Length of the lease agreement. Used to calculate the renewal date.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Contract Term</label>
              <Select value={contractTermYears} onValueChange={(v) => setContractTermYears(v ?? '')}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Select term..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 year</SelectItem>
                  <SelectItem value="2">2 years</SelectItem>
                  <SelectItem value="3">3 years</SelectItem>
                  <SelectItem value="4">4 years</SelectItem>
                  <SelectItem value="5">5 years</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {renewalDate && (
              <p className="text-sm text-muted-foreground">
                Renewal date: <span className="font-medium text-foreground">{renewalDate}</span>
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Service Request URL</CardTitle>
            <CardDescription>External link shown to customers in the sidebar to submit service requests.</CardDescription>
          </CardHeader>
          <CardContent>
            <div>
              <label className="text-sm font-medium mb-2 block">FullBay Service Request URL</label>
              <Input
                type="url"
                value={serviceRequestUrl}
                onChange={(e) => setServiceRequestUrl(e.target.value)}
                placeholder="https://app.fullbay.com/..."
              />
              <p className="text-xs text-muted-foreground mt-1">
                Leave blank to hide the button from the sidebar.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Telematics Dashboard Credentials</CardTitle>
            <CardDescription>
              Reference credentials for logging into the provider&apos;s web dashboard (e.g. Motive, Samsara).
              These are <strong>not</strong> the API credentials — they are a convenience reference for the service department.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Dashboard URL</label>
              <Input
                type="url"
                value={telematicsDashboardUrl}
                onChange={(e) => setTelematicsDashboardUrl(e.target.value)}
                placeholder="https://app.gomotive.com"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Username</label>
              <Input
                type="text"
                value={telematicsDashboardUsername}
                onChange={(e) => setTelematicsDashboardUsername(e.target.value)}
                placeholder="username@example.com"
                autoComplete="off"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Password</label>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={telematicsDashboardPassword}
                  onChange={(e) => setTelematicsDashboardPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center gap-4">
          <Button type="submit" disabled={savingPortal}>
            {savingPortal ? 'Saving...' : 'Save Portal Settings'}
          </Button>
          {portalStatusMsg && (
            <p className={`text-sm ${portalStatusMsg.type === 'success' ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
              {portalStatusMsg.text}
            </p>
          )}
        </div>
      </form>
    </div>
  );
}
