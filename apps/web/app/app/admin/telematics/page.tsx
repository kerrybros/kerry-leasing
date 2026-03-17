'use client';

import { useOrganization } from '@clerk/nextjs';
import { useEffect, useState } from 'react';
import { useApiClient } from '@/hooks/useApiClient';

type Provider = 'MOTIVE' | 'SAMSARA';

interface TelematicsStatus {
  provider: Provider | null;
  status: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
}

export default function AdminTelematicsPage() {
  const { organization } = useOrganization();
  const { getApi } = useApiClient();

  const [status, setStatus] = useState<TelematicsStatus>({ provider: null, status: null, lastSyncAt: null, lastError: null });
  const [loading, setLoading] = useState(true);

  const [provider, setProvider] = useState<Provider>('MOTIVE');
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [contractStartDate, setContractStartDate] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [syncSuccess, setSyncSuccess] = useState<string | null>(null);
  const [backdateSuccess, setBackdateSuccess] = useState<string | null>(null);
  const [backdating, setBackdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        setProvider(settings.telematicsProvider);
        setStatus(prev => ({ ...prev, provider: settings.telematicsProvider }));
      }
      setContractStartDate(settings.contractStartDate ?? null);
    } catch (err: any) {
      // Settings endpoint may return 404 if not configured yet — that's fine
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization?.id || !apiKey.trim()) return;

    try {
      setSaving(true);
      setError(null);
      setSaveSuccess(null);

      const api = await getApi();
      const credentials = provider === 'MOTIVE'
        ? { apiKey: apiKey.trim() }
        : { apiToken: apiKey.trim() };

      await api.post('/telematics/admin/telematics/configure', {
        clerkOrgId: organization.id,
        provider,
        credentials,
      });

      setSaveSuccess(`${provider} credentials saved successfully.`);
      setApiKey('');
      await loadStatus();
    } catch (err: any) {
      setError(err.message || 'Failed to save credentials');
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async () => {
    if (!organization?.id) return;

    try {
      setSyncing(true);
      setError(null);
      setSyncSuccess(null);

      const api = await getApi();
      const result = await api.post<{
        results: Array<{ clerkOrgId: string; success: boolean; error?: string }>;
      }>('/telematics/admin/telematics/sync', {});

      const r = result.results?.find((x) => x.clerkOrgId === organization.id) ?? result.results?.[0];
      if (r?.success) {
        setSyncSuccess('Sync completed successfully.');
      } else {
        setError(r?.error || 'Sync failed');
      }
    } catch (err: any) {
      setError(err.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const handleBackdate = async () => {
    if (!organization?.id) return;

    try {
      setBackdating(true);
      setError(null);
      setBackdateSuccess(null);

      const api = await getApi();
      await api.post<{ started: boolean; startDate: string; endDate: string; message?: string }>(
        '/telematics/admin/telematics/backdate',
        {}
      );

      setBackdateSuccess('Backdate started. This runs in the background and may take several minutes.');
    } catch (err: any) {
      setError(err.message || 'Failed to start backdate');
    } finally {
      setBackdating(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Telematics Settings</h1>
        <p className="text-text-secondary">
          Configure the telematics provider and API credentials for{' '}
          <span className="font-semibold">{organization?.name}</span>
        </p>
      </div>

      {/* Current Status */}
      {!loading && (
        <div className="mb-8 bg-bg-secondary border border-border rounded-lg p-5">
          <h2 className="text-base font-semibold mb-3 text-text-secondary uppercase tracking-wide">Current Status</h2>
          {status.provider ? (
            <div className="flex items-center gap-3">
              <span className="px-3 py-1 rounded-full text-sm font-semibold bg-green-100 text-green-800">
                {status.provider === 'MOTIVE' ? '📡 Motive' : '🛰️ Samsara'} — Configured
              </span>
              <span className="text-sm text-text-secondary">
                Re-save credentials below to update or encrypt existing keys.
              </span>
            </div>
          ) : (
            <span className="text-sm text-text-secondary italic">No telematics provider configured yet.</span>
          )}
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
          <strong>Error:</strong> {error}
        </div>
      )}

      {saveSuccess && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800">
          {saveSuccess}
        </div>
      )}

      {(syncSuccess || backdateSuccess) && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800">
          {syncSuccess || backdateSuccess}
        </div>
      )}

      {/* Config Form */}
      <form onSubmit={handleSave} className="bg-bg-secondary border border-border rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold mb-5">Configure Provider</h2>

        <div className="flex flex-col gap-5 max-w-lg">
          {/* Provider Select */}
          <div>
            <label className="block text-sm font-medium mb-2">Provider</label>
            <div className="flex gap-3">
              {(['MOTIVE', 'SAMSARA'] as Provider[]).map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setProvider(p)}
                  className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    provider === p
                      ? 'bg-primary text-white border-primary'
                      : 'bg-bg-tertiary text-text-primary border-border hover:bg-bg-hover'
                  }`}
                >
                  {p === 'MOTIVE' ? '📡 Motive' : '🛰️ Samsara'}
                </button>
              ))}
            </div>
          </div>

          {/* API Key */}
          <div>
            <label className="block text-sm font-medium mb-2">
              {provider === 'MOTIVE' ? 'Motive API Key' : 'Samsara API Token'}
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={provider === 'MOTIVE' ? 'Enter Motive API key...' : 'Enter Samsara API token...'}
              className="w-full px-3 py-2 bg-bg-primary border border-border rounded-lg text-sm focus:outline-none focus:border-primary"
              required
            />
            <p className="text-xs text-text-secondary mt-1">
              Credentials are encrypted before being stored.
            </p>
          </div>

          <button
            type="submit"
            disabled={saving || !apiKey.trim()}
            className="w-fit px-5 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark disabled:opacity-50 text-sm font-medium"
          >
            {saving ? 'Saving...' : 'Save Credentials'}
          </button>
        </div>
      </form>

      {/* Sync Yesterday */}
      {status.provider && (
        <div className="bg-bg-secondary border border-border rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold mb-2">Sync Yesterday</h2>
          <p className="text-sm text-text-secondary mb-4">
            Pulls the previous day&apos;s data from the API. Syncs run automatically each day.
          </p>
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing}
            className="px-5 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark disabled:opacity-50 text-sm font-medium flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {syncing ? 'Syncing...' : 'Sync Yesterday'}
          </button>
        </div>
      )}

      {/* Backdate Historical Data */}
      {status.provider && (
        <div className="bg-bg-secondary border border-border rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-2">Backdate Historical Data</h2>
          <p className="text-sm text-text-secondary mb-4">
            Pull telematics data from the contract start date through yesterday. Run this after onboarding
            to backfill historical data before building the service plan fleet.
            {contractStartDate && (
              <span className="block mt-2 font-medium text-text-primary">
                Start date: {contractStartDate}
              </span>
            )}
          </p>
          {!contractStartDate && (
            <p className="text-sm text-amber-600 dark:text-amber-400 mb-4">
              Set the contract start date in Org Settings first.
            </p>
          )}
          <button
            type="button"
            onClick={handleBackdate}
            disabled={backdating || !contractStartDate}
            className="px-5 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark disabled:opacity-50 text-sm font-medium flex items-center gap-2"
          >
            {backdating ? 'Starting...' : 'Start Backdate'}
          </button>
        </div>
      )}
    </div>
  );
}
