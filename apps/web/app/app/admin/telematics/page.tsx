'use client';

import Link from 'next/link';
import { useOrganization } from '@clerk/nextjs';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Users } from 'lucide-react';
import { useApiClient } from '@/hooks/useApiClient';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/Skeleton';

type Provider = 'MOTIVE' | 'SAMSARA';

interface BackdateReport {
  completedAt: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  successCount: number;
  errorCount: number;
  failedDates: { date: string; error: string }[];
}

export default function AdminTelematicsPage() {
  const { organization } = useOrganization();
  const { getApi } = useApiClient();
  const queryClient = useQueryClient();

  const [configuredProvider, setConfiguredProvider] = useState<Provider | null>(null);
  const [contractStartDate, setContractStartDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [provider, setProvider] = useState<Provider>('MOTIVE');
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [backdating, setBackdating] = useState(false);
  const [syncDate, setSyncDate] = useState('');
  const [syncingDate, setSyncingDate] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);

  const [report, setReport] = useState<BackdateReport | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [syncDateDetails, setSyncDateDetails] = useState<{
    durationSeconds: number;
    breakdown: { endpoint: string; newCount: number; updatedCount: number; unchangedCount: number }[];
  } | null>(null);

  // Status messages
  const [saveMsg, setSaveMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [syncMsg, setSyncMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [backdateMsg, setBackdateMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [syncDateMsg, setSyncDateMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const autoHide = (setter: (v: null) => void, ms = 6000) => {
    setTimeout(() => setter(null), ms);
  };

  useEffect(() => {
    if (!organization?.id) return;
    loadStatus();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organization?.id]);

  const loadStatus = async () => {
    try {
      setLoading(true);
      const api = await getApi();
      const settings = await api.get<{ telematicsProvider: Provider | null; contractStartDate: string | null }>('/org/settings');
      if (settings.telematicsProvider) {
        setConfiguredProvider(settings.telematicsProvider);
        setProvider(settings.telematicsProvider);
      }
      setContractStartDate(settings.contractStartDate ?? null);
      if (settings.telematicsProvider) loadBackdateReport();
    } catch {
      // Settings not configured yet
    } finally {
      setLoading(false);
    }
  };

  const loadBackdateReport = async () => {
    try {
      setReportLoading(true);
      const api = await getApi();
      const res = await api.get<{ report: BackdateReport | null }>('/telematics/admin/telematics/backdate-report');
      setReport(res.report ?? null);
    } catch {
      setReport(null);
    } finally {
      setReportLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization?.id || !apiKey.trim()) return;
    try {
      setSaving(true);
      setSaveMsg(null);
      const api = await getApi();
      const credentials = provider === 'MOTIVE'
        ? { apiKey: apiKey.trim() }
        : { apiToken: apiKey.trim() };
      await api.post('/telematics/admin/telematics/configure', {
        clerkOrgId: organization.id, provider, credentials,
      });
      await queryClient.invalidateQueries({ queryKey: ['org-settings', organization?.id] });
      setSaveMsg({ type: 'success', text: `${provider} credentials saved.` });
      autoHide(setSaveMsg);
      setApiKey('');
      await loadStatus();
    } catch (err: unknown) {
      setSaveMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save credentials' });
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async () => {
    if (!organization?.id) return;
    try {
      setSyncing(true);
      setSyncMsg(null);
      const api = await getApi();
      const result = await api.post<{ results: Array<{ clerkOrgId: string; success: boolean; error?: string }> }>(
        '/telematics/admin/telematics/sync', {}
      );
      const r = result.results?.find(x => x.clerkOrgId === organization.id) ?? result.results?.[0];
      if (r?.success) {
        setSyncMsg({ type: 'success', text: 'Sync completed.' });
      } else {
        setSyncMsg({ type: 'error', text: r?.error || 'Sync failed' });
      }
      autoHide(setSyncMsg);
    } catch (err: unknown) {
      setSyncMsg({ type: 'error', text: err instanceof Error ? err.message : 'Sync failed' });
    } finally {
      setSyncing(false);
    }
  };

  const handleBackdate = async () => {
    if (!organization?.id) return;
    try {
      setBackdating(true);
      setBackdateMsg(null);
      const api = await getApi();
      await api.post('/telematics/admin/telematics/backdate', {});
      setBackdateMsg({ type: 'success', text: 'Backdate started. This runs in the background and may take several minutes.' });
      autoHide(setBackdateMsg, 10000);
    } catch (err: unknown) {
      setBackdateMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed to start backdate' });
    } finally {
      setBackdating(false);
    }
  };

  const handleSyncDate = async (date: string) => {
    if (!organization?.id || !date) return;
    try {
      setSyncingDate(true);
      setSyncDateMsg(null);
      setSyncDateDetails(null);
      const api = await getApi();
      const result = await api.post<{
        success: boolean; date: string; error?: string;
        details?: { durationSeconds: number; breakdown: { endpoint: string; newCount: number; updatedCount: number; unchangedCount: number }[] };
      }>('/telematics/admin/telematics/sync-date', { date });
      if (result.success) {
        setSyncDateMsg({ type: 'success', text: `Synced ${date} successfully.` });
        setSyncDateDetails(result.details ?? null);
      } else {
        setSyncDateMsg({ type: 'error', text: result.error || 'Sync failed' });
      }
    } catch (err: unknown) {
      setSyncDateMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed to sync date' });
    } finally {
      setSyncingDate(false);
    }
  };

  const StatusMsg = ({ msg }: { msg: { type: 'success' | 'error'; text: string } | null }) => {
    if (!msg) return null;
    return (
      <p className={`text-sm mt-2 ${msg.type === 'success' ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
        {msg.text}
      </p>
    );
  };

  if (loading) {
    return (
      <div className="mx-auto px-4 py-8 max-w-3xl flex flex-col gap-4">
        <Skeleton style={{ height: 32, width: '40%', borderRadius: 8 }} />
        {[1,2,3].map(i => <Skeleton key={i} style={{ height: 120, borderRadius: 8 }} />)}
      </div>
    );
  }

  return (
    <div className="mx-auto px-4 py-8 max-w-3xl flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold mb-1">Telematics Settings</h1>
        <p className="text-sm text-muted-foreground">
          Configure the telematics provider for{' '}
          <span className="font-semibold text-foreground">{organization?.name}</span>
        </p>
      </div>

      {/* Current Status */}
      <Card>
        <CardContent className="pt-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Current Status</p>
          {configuredProvider ? (
            <div className="flex items-center gap-3">
              <Badge variant="default">{configuredProvider} — Configured</Badge>
              <span className="text-sm text-muted-foreground">Re-save credentials below to update.</span>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No telematics provider configured.</p>
          )}
        </CardContent>
      </Card>

      {/* Configure Provider */}
      <Card>
        <CardContent className="pt-6">
          <h2 className="text-base font-semibold mb-4">Configure Provider</h2>
          <form onSubmit={handleSave} className="flex flex-col gap-4 max-w-md">
            <div>
              <p className="text-sm font-medium mb-2">Provider</p>
              <div className="flex gap-3">
                {(['MOTIVE', 'SAMSARA'] as Provider[]).map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setProvider(p)}
                    className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      provider === p
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background border-border text-foreground hover:bg-accent'
                    }`}
                  >
                    {p === 'MOTIVE' ? 'Motive' : 'Samsara'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">
                {provider === 'MOTIVE' ? 'Motive API Key' : 'Samsara API Token'}
              </label>
              <Input
                type="password"
                value={apiKey}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setApiKey(e.target.value)}
                placeholder={provider === 'MOTIVE' ? 'Enter Motive API key...' : 'Enter Samsara API token...'}
                required
              />
              <p className="text-xs text-muted-foreground mt-1">Credentials are encrypted before being stored.</p>
            </div>
            <Button type="submit" disabled={saving || !apiKey.trim()} className="w-fit">
              {saving ? 'Saving...' : 'Save Credentials'}
            </Button>
            <StatusMsg msg={saveMsg} />
          </form>
        </CardContent>
      </Card>

      {/* Driver Setup — Motive only (driver roster comes from Motive) */}
      {configuredProvider === 'MOTIVE' && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Users className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-base font-semibold">Driver Setup</h2>
                  <p className="text-sm text-muted-foreground">
                    Choose which Motive drivers appear in the portal. Excluded drivers are hidden from
                    the scoreboard, SMS reports, and KPIs.
                  </p>
                </div>
              </div>
              <Link href="/app/admin/telematics/drivers" className="no-underline shrink-0">
                <Button>Manage Drivers</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sync Controls */}
      {configuredProvider && (
        <>
          <Card>
            <CardContent className="pt-6">
              <h2 className="text-base font-semibold mb-1">Sync Yesterday</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Pulls the previous day&apos;s data from the API. Syncs run automatically each day.
              </p>
              <Button onClick={handleSync} disabled={syncing} variant="outline">
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {syncing ? 'Syncing...' : 'Sync Yesterday'}
              </Button>
              <StatusMsg msg={syncMsg} />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <h2 className="text-base font-semibold mb-1">Backdate Historical Data</h2>
              <p className="text-sm text-muted-foreground mb-1">
                Pull telematics data from the contract start date through yesterday.
              </p>
              {contractStartDate && (
                <p className="text-sm font-medium text-foreground mb-3">Start date: {contractStartDate}</p>
              )}
              {!contractStartDate && (
                <p className="text-sm text-amber-600 dark:text-amber-400 mb-3">
                  Set the contract start date in Org Settings first.
                </p>
              )}
              <Button onClick={handleBackdate} disabled={backdating || !contractStartDate} variant="outline">
                {backdating ? 'Starting...' : 'Start Backdate'}
              </Button>
              <StatusMsg msg={backdateMsg} />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <h2 className="text-base font-semibold mb-1">Sync Specific Date</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Re-pull telematics data for a single date. Use to retry failed backdate days.
              </p>
              <div className="flex gap-3 items-center flex-wrap">
                <Input
                  type="date"
                  value={syncDate}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSyncDate(e.target.value)}
                  className="w-auto"
                />
                <Button onClick={() => handleSyncDate(syncDate)} disabled={syncingDate || !syncDate} variant="outline">
                  {syncingDate ? 'Syncing...' : 'Sync This Date'}
                </Button>
              </div>
              <StatusMsg msg={syncDateMsg} />
              {syncDateDetails && (
                <div className="mt-3 text-sm">
                  <p className="font-medium mb-1">Sync results:</p>
                  <ul className="space-y-0.5 text-muted-foreground list-disc list-inside">
                    {syncDateDetails.breakdown.map(row => {
                      const label = row.endpoint.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                      const parts = [
                        row.newCount > 0 && `${row.newCount} new`,
                        row.updatedCount > 0 && `${row.updatedCount} updated`,
                        row.unchangedCount > 0 && `${row.unchangedCount} unchanged`,
                      ].filter(Boolean);
                      return <li key={row.endpoint}>{label}: {parts.length ? parts.join(', ') : 'no changes'}</li>;
                    })}
                  </ul>
                  <p className="text-xs mt-1 text-muted-foreground">Completed in {syncDateDetails.durationSeconds}s</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Last Backdate Report */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setReportOpen(o => !o)}
                  className="flex items-center gap-2 text-base font-semibold hover:text-primary transition-colors"
                >
                  <svg
                    className={`w-4 h-4 transition-transform ${reportOpen ? 'rotate-90' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  Last Backdate Report
                </button>
                <Button variant="ghost" size="sm" onClick={loadBackdateReport} disabled={reportLoading}>
                  Refresh
                </Button>
              </div>
              {reportOpen && (
                <div className="mt-3">
                  {reportLoading ? (
                    <p className="text-sm text-muted-foreground">Loading...</p>
                  ) : !report ? (
                    <p className="text-sm text-muted-foreground">No backdate report available.</p>
                  ) : (
                    <>
                      <p className="text-sm text-muted-foreground mb-2">
                        {report.startDate} to {report.endDate} — {report.totalDays} days,{' '}
                        {report.successCount} succeeded, {report.errorCount} failed
                        {report.completedAt && ` — completed ${new Date(report.completedAt).toLocaleString()}`}
                      </p>
                      {report.failedDates?.length > 0 && (
                        <div>
                          <p className="text-sm font-medium text-amber-600 dark:text-amber-400 mb-2">Failed days</p>
                          <ul className="space-y-1.5">
                            {report.failedDates.map(({ date, error }) => (
                              <li key={date} className="flex items-center justify-between gap-3 p-2 bg-destructive/5 border border-destructive/20 rounded text-sm">
                                <span className="font-medium text-foreground">{date}</span>
                                <span className="text-muted-foreground flex-1 truncate text-xs" title={error}>{error}</span>
                                <button
                                  onClick={() => { setSyncDate(date); handleSyncDate(date); }}
                                  disabled={syncingDate}
                                  className="text-xs px-2 py-1 rounded border border-destructive/30 text-destructive hover:bg-destructive/10 disabled:opacity-50"
                                >
                                  Retry
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
