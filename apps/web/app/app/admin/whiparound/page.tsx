'use client';

import { useOrganization } from '@clerk/nextjs';
import { useEffect, useState } from 'react';
import { useApiClient } from '@/hooks/useApiClient';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/Skeleton';

interface WhiparoundStatus {
  clerkOrgId: string;
  status: 'ACTIVE' | 'INACTIVE';
  lastSyncAt: string | null;
  lastSyncAgeHours: number | null;
  lastError: string | null;
  stale: boolean;
  updatedAt: string;
}

interface StatusResponse {
  total: number;
  active: number;
  staleCount: number;
  accounts: WhiparoundStatus[];
}

export default function AdminWhiparoundPage() {
  const { organization } = useOrganization();
  const { getApi } = useApiClient();

  const [status, setStatus] = useState<WhiparoundStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const [saveMsg, setSaveMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [syncMsg, setSyncMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const autoHide = (setter: (v: null) => void, ms = 6000) => {
    setTimeout(() => setter(null), ms);
  };

  const loadStatus = async () => {
    if (!organization?.id) return;
    try {
      setLoading(true);
      const api = await getApi();
      const res = await api.get<StatusResponse>('/admin/orgs/whiparound/status');
      const mine = res.accounts.find(a => a.clerkOrgId === organization.id) ?? null;
      setStatus(mine);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organization?.id]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization?.id || !apiKey.trim()) return;
    try {
      setSaving(true);
      setSaveMsg(null);
      const api = await getApi();
      await api.post('/admin/orgs/whiparound/configure', {
        clerkOrgId: organization.id,
        apiKey: apiKey.trim(),
      });
      setSaveMsg({ type: 'success', text: 'API key saved and validated.' });
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
      const result = await api.post<{ success: boolean; inspectionsSynced: number; defectsSynced: number; errors: number; error?: string }>(
        '/admin/orgs/whiparound/sync',
        { clerkOrgId: organization.id }
      );
      if (result.success) {
        setSyncMsg({
          type: 'success',
          text: `Sync complete — ${result.inspectionsSynced} inspections, ${result.defectsSynced} defects.`,
        });
        await loadStatus();
      } else {
        setSyncMsg({ type: 'error', text: result.error ?? 'Sync failed' });
      }
      autoHide(setSyncMsg, 8000);
    } catch (err: unknown) {
      setSyncMsg({ type: 'error', text: err instanceof Error ? err.message : 'Sync failed' });
    } finally {
      setSyncing(false);
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

  const formatAge = (hours: number | null) => {
    if (hours === null) return 'never synced';
    if (hours < 1) return 'less than 1 hour ago';
    if (hours < 24) return `${Math.round(hours)}h ago`;
    return `${Math.round(hours / 24)}d ago`;
  };

  if (loading) {
    return (
      <div className="mx-auto px-4 py-8 max-w-3xl flex flex-col gap-4">
        <Skeleton style={{ height: 32, width: '40%', borderRadius: 8 }} />
        {[1, 2, 3].map(i => <Skeleton key={i} style={{ height: 120, borderRadius: 8 }} />)}
      </div>
    );
  }

  return (
    <div className="mx-auto px-4 py-8 max-w-3xl flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold mb-1">Whiparound Settings</h1>
        <p className="text-sm text-muted-foreground">
          Configure the Whip Around DVIR integration for{' '}
          <span className="font-semibold text-foreground">{organization?.name}</span>
        </p>
      </div>

      {/* Current Status */}
      <Card>
        <CardContent className="pt-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Current Status</p>
          {status ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <Badge variant={status.status === 'ACTIVE' ? 'default' : 'secondary'}>
                  {status.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                </Badge>
                {status.stale && (
                  <Badge variant="destructive">Stale</Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                Last synced: <span className="text-foreground">{formatAge(status.lastSyncAgeHours)}</span>
              </p>
              {status.lastError && (
                <p className="text-sm text-destructive">Last error: {status.lastError}</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Not configured for this organization.</p>
          )}
        </CardContent>
      </Card>

      {/* Configure */}
      <Card>
        <CardContent className="pt-6">
          <h2 className="text-base font-semibold mb-1">Configure API Key</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Enter the Whip Around API key for this organization. The key will be validated before saving.
          </p>
          <form onSubmit={handleSave} className="flex flex-col gap-4 max-w-md">
            <div>
              <label className="text-sm font-medium mb-2 block">Whip Around API Key</label>
              <Input
                type="password"
                value={apiKey}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setApiKey(e.target.value)}
                placeholder="Enter API key..."
                required
              />
              <p className="text-xs text-muted-foreground mt-1">Credentials are encrypted before being stored.</p>
            </div>
            <Button type="submit" disabled={saving || !apiKey.trim()} className="w-fit">
              {saving ? 'Validating & Saving...' : status ? 'Update API Key' : 'Save API Key'}
            </Button>
            <StatusMsg msg={saveMsg} />
          </form>
        </CardContent>
      </Card>

      {/* Manual Sync */}
      {status && (
        <Card>
          <CardContent className="pt-6">
            <h2 className="text-base font-semibold mb-1">Sync Now</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Manually pull the latest inspections and defects from Whip Around.
              On first run this performs a full historical backfill.
            </p>
            <Button onClick={handleSync} disabled={syncing} variant="outline">
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {syncing ? 'Syncing...' : 'Sync Now'}
            </Button>
            <StatusMsg msg={syncMsg} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
