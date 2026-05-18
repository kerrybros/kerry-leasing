'use client';

import { useOrganization } from '@clerk/nextjs';
import { useEffect, useState } from 'react';
import { useApiClient } from '@/hooks/useApiClient';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/Skeleton';

const KPI_OPTIONS = [
  { value: 'SAFETY',       label: 'Safety score' },
  { value: 'IDLE_PCT',     label: 'Idle %' },
  { value: 'MPG',          label: 'MPG' },
  { value: 'MILES',        label: 'Miles' },
  { value: 'HARD_EVENTS',  label: 'Hard events' },
] as const;
type Kpi = typeof KPI_OPTIONS[number]['value'];

interface SmsConfig {
  clerkOrgId: string;
  enabled: boolean;
  kpis: Kpi[];
  sendHourEt: number;
  lastSentAt: string | null;
}

type MatchStatus = 'FULL' | 'MOTIVE_ONLY' | 'WHIPAROUND_ONLY' | 'NEITHER';

interface DriverRow {
  id: string;
  displayName: string;
  email: string | null;
  phoneE164: string | null;
  motiveDriverId: number | null;
  whiparoundDriverId: number | null;
  enrolled: boolean;
  optedOut: boolean;
  source: 'WHIPAROUND_SYNC' | 'MANUAL' | 'MOTIVE_AUTO';
  matchStatus: MatchStatus;
  lastSentAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
}

interface HistoryRow {
  id: string;
  driverContactId: string;
  driverName: string;
  driverPhone: string | null;
  optedOut: boolean;
  weekStartDate: string;
  sentAt: string;
  status: string;
  twilioErrorCode: string | null;
  isTest: boolean;
  reportUrl: string;
  bodyPreview: string | null;
}

type Tab = 'config' | 'drivers' | 'history';

export default function AdminSmsReportsPage() {
  const { organization } = useOrganization();
  const { getApi } = useApiClient();
  const [tab, setTab] = useState<Tab>('config');

  // Config state
  const [config, setConfig] = useState<SmsConfig | null>(null);
  const [dryRunFlag, setDryRunFlag] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [configMsg, setConfigMsg] = useState<string | null>(null);

  // Drivers state
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [loadingDrivers, setLoadingDrivers] = useState(false);
  const [newDriverName, setNewDriverName] = useState('');
  const [newDriverPhone, setNewDriverPhone] = useState('');
  const [mergingFromId, setMergingFromId] = useState<string | null>(null);
  const [driverFilter, setDriverFilter] = useState<'all' | 'partial' | 'matched'>('all');

  // History state
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Test-send state
  const [testPhone, setTestPhone] = useState('');
  const [testDriverContactId, setTestDriverContactId] = useState('');
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string; reportUrl?: string } | null>(null);
  const [sendingTest, setSendingTest] = useState(false);

  // Trigger now state
  const [triggering, setTriggering] = useState(false);
  const [triggerResult, setTriggerResult] = useState<string | null>(null);

  const loadConfig = async () => {
    if (!organization?.id) return;
    const api = await getApi();
    const res = await api.get<{ config: SmsConfig; dryRun: boolean }>('/admin/sms-reports/config');
    setConfig(res.config);
    setDryRunFlag(res.dryRun);
  };

  const loadDrivers = async () => {
    if (!organization?.id) return;
    setLoadingDrivers(true);
    try {
      const api = await getApi();
      const res = await api.get<{ drivers: DriverRow[] }>('/admin/sms-reports/drivers');
      setDrivers(res.drivers);
    } finally {
      setLoadingDrivers(false);
    }
  };

  const loadHistory = async () => {
    if (!organization?.id) return;
    setLoadingHistory(true);
    try {
      const api = await getApi();
      const res = await api.get<{ rows: HistoryRow[] }>('/admin/sms-reports/history');
      setHistory(res.rows);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    loadConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organization?.id]);

  useEffect(() => {
    if (tab === 'drivers') loadDrivers();
    if (tab === 'history') loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, organization?.id]);

  // ----- Config handlers -----
  const toggleKpi = (kpi: Kpi, on: boolean) => {
    if (!config) return;
    setConfig({
      ...config,
      kpis: on ? [...new Set([...config.kpis, kpi])] : config.kpis.filter((k) => k !== kpi),
    });
  };

  const saveConfig = async () => {
    if (!config) return;
    setSavingConfig(true);
    setConfigMsg(null);
    try {
      const api = await getApi();
      await api.put('/admin/sms-reports/config', {
        enabled: config.enabled,
        kpis: config.kpis,
        sendHourEt: config.sendHourEt,
      });
      setConfigMsg('Saved.');
    } catch (e: any) {
      setConfigMsg(`Error: ${e.message ?? e}`);
    } finally {
      setSavingConfig(false);
      setTimeout(() => setConfigMsg(null), 4000);
    }
  };

  // ----- Driver handlers -----
  const addDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDriverName.trim()) return;
    const api = await getApi();
    try {
      await api.post('/admin/sms-reports/drivers', {
        displayName: newDriverName.trim(),
        phoneE164: newDriverPhone.trim() || undefined,
      });
      setNewDriverName('');
      setNewDriverPhone('');
      loadDrivers();
    } catch (e: any) {
      alert(`Failed: ${e.message ?? e}`);
    }
  };

  const updateDriver = async (id: string, patch: Partial<DriverRow>) => {
    const api = await getApi();
    await api.patch(`/admin/sms-reports/drivers/${id}` as any, patch);
    loadDrivers();
  };

  const mergeInto = async (sourceId: string, targetId: string) => {
    const api = await getApi();
    try {
      await api.post(`/admin/sms-reports/drivers/${sourceId}/merge-into` as any, { targetId });
      setMergingFromId(null);
      loadDrivers();
    } catch (e: any) {
      alert(`Merge failed: ${e.message ?? e}`);
    }
  };

  // ----- Test send -----
  const sendTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testPhone.trim()) return;
    setSendingTest(true);
    setTestResult(null);
    try {
      const api = await getApi();
      const res = await api.post<{ ok: boolean; bodyPreview: string; reportUrl: string; twilioStatus: string; error?: string }>(
        '/admin/sms-reports/send-test',
        {
          phoneE164: testPhone.trim(),
          driverContactId: testDriverContactId || undefined,
        }
      );
      setTestResult({
        ok: res.ok,
        text: res.ok
          ? `Sent (Twilio status: ${res.twilioStatus}). Body preview: "${res.bodyPreview}"`
          : `Failed: ${res.error ?? 'unknown error'}`,
        reportUrl: res.reportUrl,
      });
    } catch (e: any) {
      setTestResult({ ok: false, text: `Error: ${e.message ?? e}` });
    } finally {
      setSendingTest(false);
    }
  };

  // ----- Trigger now -----
  const triggerNow = async (dryRun: boolean) => {
    setTriggering(true);
    setTriggerResult(null);
    try {
      const api = await getApi();
      const res = await api.post<{ summary: any }>('/admin/sms-reports/trigger-now', { dryRun });
      setTriggerResult(JSON.stringify(res.summary, null, 2));
      if (tab === 'history') loadHistory();
    } catch (e: any) {
      setTriggerResult(`Error: ${e.message ?? e}`);
    } finally {
      setTriggering(false);
    }
  };

  return (
    <div className="max-w-[1400px] mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">SMS Weekly Driver Reports</h1>
        {dryRunFlag && <Badge variant="secondary">DRY RUN — no Twilio calls</Badge>}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        {(['config', 'drivers', 'history'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm capitalize border-b-2 ${
              tab === t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'config' && (
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4 space-y-4">
              {!config && <Skeleton className="h-32" />}
              {config && (
                <>
                  <div className="flex items-center gap-3">
                    <Checkbox
                      id="enabled"
                      checked={config.enabled}
                      onCheckedChange={(v) => setConfig({ ...config, enabled: !!v })}
                    />
                    <Label htmlFor="enabled">Feature enabled for this customer</Label>
                  </div>

                  <div className="flex items-center gap-3">
                    <Label htmlFor="sendHour">Send hour (Monday, Eastern Time)</Label>
                    <select
                      id="sendHour"
                      className="border rounded px-2 py-1 text-sm"
                      value={config.sendHourEt}
                      onChange={(e) => setConfig({ ...config, sendHourEt: Number(e.target.value) })}
                    >
                      {[5, 6, 7, 8].map((h) => (
                        <option key={h} value={h}>{h}:00 AM ET</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <Button onClick={saveConfig} disabled={savingConfig}>
                      {savingConfig ? 'Saving…' : 'Save'}
                    </Button>
                    {configMsg && <span className="text-sm text-muted-foreground">{configMsg}</span>}
                  </div>

                  {config.lastSentAt && (
                    <p className="text-xs text-muted-foreground">
                      Last successful send: {new Date(config.lastSentAt).toLocaleString()}
                    </p>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 space-y-3">
              <h2 className="font-medium">Send a test SMS</h2>
              <p className="text-xs text-muted-foreground">
                Builds a sample report using last week&apos;s data and sends it to the phone you enter.
                The phone is normalized to E.164 (US default).
              </p>
              <form onSubmit={sendTest} className="flex flex-wrap gap-2 items-end">
                <div>
                  <Label className="block">Phone</Label>
                  <Input value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="+1 555 123 4567" className="w-64" />
                </div>
                <div>
                  <Label className="block">Use sample data from driver (optional)</Label>
                  <select
                    className="border rounded px-2 py-2 text-sm bg-background"
                    value={testDriverContactId}
                    onChange={(e) => setTestDriverContactId(e.target.value)}
                  >
                    <option value="">(first available)</option>
                    {drivers.map((d) => (
                      <option key={d.id} value={d.id}>{d.displayName}</option>
                    ))}
                  </select>
                </div>
                <Button type="submit" disabled={sendingTest}>{sendingTest ? 'Sending…' : 'Send test'}</Button>
              </form>
              {testResult && (
                <div className={`text-sm ${testResult.ok ? 'text-green-700' : 'text-destructive'}`}>
                  {testResult.text}
                  {testResult.reportUrl && (
                    <>
                      {' '}
                      <a className="underline" href={testResult.reportUrl} target="_blank" rel="noreferrer">View report page</a>
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 space-y-3">
              <h2 className="font-medium">Manual trigger (skip send-hour gate)</h2>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => triggerNow(true)} disabled={triggering}>
                  {triggering ? 'Working…' : 'Dry-run for this org'}
                </Button>
                <Button onClick={() => triggerNow(false)} disabled={triggering || !config?.enabled}>
                  {triggering ? 'Working…' : 'Send to all enrolled drivers now'}
                </Button>
              </div>
              {triggerResult && (
                <pre className="text-xs bg-muted p-2 rounded overflow-x-auto max-h-64">{triggerResult}</pre>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'drivers' && (
        <Card>
          <CardContent className="p-4 space-y-4">
            <form onSubmit={addDriver} className="flex flex-wrap gap-2 items-end">
              <div>
                <Label className="block">Driver name</Label>
                <Input value={newDriverName} onChange={(e) => setNewDriverName(e.target.value)} placeholder="Jane Doe" className="w-56" />
              </div>
              <div>
                <Label className="block">Phone (E.164 or US)</Label>
                <Input value={newDriverPhone} onChange={(e) => setNewDriverPhone(e.target.value)} placeholder="+15551234567" className="w-56" />
              </div>
              <Button type="submit">Add driver</Button>
            </form>

            <div className="flex gap-3 items-center text-xs">
              <span className="text-muted-foreground">Show:</span>
              {(['all', 'partial', 'matched'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setDriverFilter(f)}
                  className={`px-2 py-1 rounded border ${driverFilter === f ? 'bg-primary text-primary-foreground border-primary' : 'border-border'}`}
                >
                  {f === 'all' ? `All (${drivers.length})` : f === 'partial' ? `Partial match (${drivers.filter((d) => d.matchStatus === 'MOTIVE_ONLY' || d.matchStatus === 'WHIPAROUND_ONLY').length})` : `Fully matched (${drivers.filter((d) => d.matchStatus === 'FULL').length})`}
                </button>
              ))}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground border-b">
                  <tr>
                    <th className="py-2 pr-3">Name</th>
                    <th className="py-2 pr-3">Match</th>
                    <th className="py-2 pr-3">Email</th>
                    <th className="py-2 pr-3">Phone</th>
                    <th className="py-2 pr-3">Motive</th>
                    <th className="py-2 pr-3">WP</th>
                    <th className="py-2 pr-3">Source</th>
                    <th className="py-2 pr-3">Enrolled</th>
                    <th className="py-2 pr-3">Opt-out</th>
                    <th className="py-2 pr-3">Last send</th>
                    <th className="py-2 pr-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingDrivers && (
                    <tr><td colSpan={11}><Skeleton className="h-8 my-2" /></td></tr>
                  )}
                  {!loadingDrivers && drivers.length === 0 && (
                    <tr>
                      <td colSpan={11} className="py-4 text-muted-foreground">
                        No drivers yet. They&apos;ll appear after the first Motive sync, Whiparound sync, or via the manual add form above.
                      </td>
                    </tr>
                  )}
                  {drivers
                    .filter((d) => {
                      if (driverFilter === 'all') return true;
                      if (driverFilter === 'matched') return d.matchStatus === 'FULL';
                      return d.matchStatus === 'MOTIVE_ONLY' || d.matchStatus === 'WHIPAROUND_ONLY';
                    })
                    .map((d) => {
                    // Merge candidates: rows that have the COMPLEMENTARY id this row is missing
                    const mergeCandidates =
                      d.matchStatus === 'MOTIVE_ONLY'
                        ? drivers.filter((x) => x.id !== d.id && x.whiparoundDriverId != null)
                        : d.matchStatus === 'WHIPAROUND_ONLY'
                        ? drivers.filter((x) => x.id !== d.id && x.motiveDriverId != null)
                        : drivers.filter((x) => x.id !== d.id);

                    return (
                    <tr key={d.id} className="border-b">
                      <td className="py-2 pr-3">
                        <Input
                          value={d.displayName}
                          onChange={(e) =>
                            setDrivers((rows) => rows.map((r) => (r.id === d.id ? { ...r, displayName: e.target.value } : r)))
                          }
                          onBlur={(e) => updateDriver(d.id, { displayName: e.target.value })}
                          className="h-7 w-44"
                        />
                      </td>
                      <td className="py-2 pr-3">
                        {d.matchStatus === 'FULL' && <Badge>Matched</Badge>}
                        {d.matchStatus === 'MOTIVE_ONLY' && <Badge variant="secondary">Motive only</Badge>}
                        {d.matchStatus === 'WHIPAROUND_ONLY' && <Badge variant="secondary">WP only</Badge>}
                        {d.matchStatus === 'NEITHER' && <Badge variant="outline">No link</Badge>}
                      </td>
                      <td className="py-2 pr-3 text-xs">{d.email ?? <span className="text-muted-foreground">—</span>}</td>
                      <td className="py-2 pr-3">
                        <Input
                          value={d.phoneE164 ?? ''}
                          onChange={(e) =>
                            setDrivers((rows) => rows.map((r) => (r.id === d.id ? { ...r, phoneE164: e.target.value || null } : r)))
                          }
                          onBlur={(e) => updateDriver(d.id, { phoneE164: e.target.value || null })}
                          placeholder="+1…"
                          className="h-7 w-36"
                        />
                      </td>
                      <td className="py-2 pr-3 text-xs text-muted-foreground">{d.motiveDriverId ?? '—'}</td>
                      <td className="py-2 pr-3 text-xs text-muted-foreground">{d.whiparoundDriverId ?? '—'}</td>
                      <td className="py-2 pr-3 text-xs text-muted-foreground">{d.source.toLowerCase().replace('_', ' ')}</td>
                      <td className="py-2 pr-3">
                        <Checkbox
                          checked={d.enrolled}
                          onCheckedChange={(v) => updateDriver(d.id, { enrolled: !!v })}
                        />
                      </td>
                      <td className="py-2 pr-3">
                        {d.optedOut ? <Badge variant="destructive">Opted out</Badge> : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="py-2 pr-3 text-xs">
                        {d.lastSentAt ? (
                          <>
                            <div>{new Date(d.lastSentAt).toLocaleString()}</div>
                            <div className="text-muted-foreground">{d.lastStatus}{d.lastError ? ` (${d.lastError})` : ''}</div>
                          </>
                        ) : (
                          <span className="text-muted-foreground">never</span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-xs">
                        {d.matchStatus !== 'FULL' && (
                          mergingFromId === d.id ? (
                            <div className="flex gap-1 items-center">
                              <select
                                className="border rounded px-1 py-1 text-xs bg-background max-w-[200px]"
                                defaultValue=""
                                onChange={(e) => {
                                  if (e.target.value) mergeInto(d.id, e.target.value);
                                }}
                              >
                                <option value="">Merge into…</option>
                                {mergeCandidates.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.displayName} {c.matchStatus === 'FULL' ? '✓' : ''}
                                  </option>
                                ))}
                              </select>
                              <button onClick={() => setMergingFromId(null)} className="text-muted-foreground hover:text-foreground">✕</button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setMergingFromId(d.id)}
                              className="underline text-muted-foreground hover:text-foreground"
                            >
                              merge
                            </button>
                          )
                        )}
                      </td>
                    </tr>
                  );})}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {tab === 'history' && (
        <Card>
          <CardContent className="p-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground border-b">
                  <tr>
                    <th className="py-2 pr-3">Week</th>
                    <th className="py-2 pr-3">Driver</th>
                    <th className="py-2 pr-3">Phone</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Sent</th>
                    <th className="py-2 pr-3">Report</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingHistory && (<tr><td colSpan={6}><Skeleton className="h-8 my-2" /></td></tr>)}
                  {!loadingHistory && history.length === 0 && (
                    <tr><td colSpan={6} className="py-4 text-muted-foreground">No sends yet.</td></tr>
                  )}
                  {history.map((r) => (
                    <tr key={r.id} className="border-b">
                      <td className="py-2 pr-3">{r.weekStartDate}{r.isTest && <Badge variant="outline" className="ml-1">test</Badge>}</td>
                      <td className="py-2 pr-3">{r.driverName}</td>
                      <td className="py-2 pr-3 text-xs">{r.driverPhone ?? '—'}</td>
                      <td className="py-2 pr-3">
                        <Badge variant={r.status === 'DELIVERED' || r.status === 'SENT' ? 'default' : r.status === 'FAILED' ? 'destructive' : 'secondary'}>{r.status}</Badge>
                        {r.twilioErrorCode && <span className="text-xs text-muted-foreground ml-2">err {r.twilioErrorCode}</span>}
                      </td>
                      <td className="py-2 pr-3 text-xs">{new Date(r.sentAt).toLocaleString()}</td>
                      <td className="py-2 pr-3 text-xs">
                        <a href={r.reportUrl} className="underline" target="_blank" rel="noreferrer">open</a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
