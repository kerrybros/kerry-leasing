'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useApiClient } from '@/hooks/useApiClient';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/Skeleton';

function ErrorModal({ error, onClose }: { error: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(error);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-full max-w-lg mx-4 rounded-xl border border-border bg-background shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-sm font-semibold text-foreground">Last Error</span>
          <div className="flex items-center gap-2">
            <button onClick={handleCopy} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-muted">
              {copied ? (
                <><svg className="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg><span className="text-green-500">Copied</span></>
              ) : (
                <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>Copy</>
              )}
            </button>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded hover:bg-muted">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
        <pre className="px-4 py-3 text-xs text-destructive whitespace-pre-wrap break-all font-mono max-h-72 overflow-y-auto">{error}</pre>
      </div>
    </div>
  );
}

interface CronAccount {
  clerkOrgId: string;
  orgName: string;
  provider: 'MOTIVE' | 'SAMSARA';
  status: string;
  lastSyncAt: string | null;
  lastError: string | null;
  lastSyncAgeHours: number | null;
  stale: boolean;
}

interface CronHealthResponse {
  timestamp: string;
  total: number;
  active: number;
  error: number;
  staleCount: number;
  accounts: CronAccount[];
}

export default function CronHealthPage() {
  const { getApi } = useApiClient();
  const [errorModal, setErrorModal] = useState<string | null>(null);

  const { data, isLoading, error, refetch, isFetching } = useQuery<CronHealthResponse>({
    queryKey: ['cron-health'],
    queryFn: async () => {
      const api = await getApi();
      return api.get<CronHealthResponse>('/admin/orgs/cron-health');
    },
    refetchInterval: 60_000,
  });

  return (
    <div className="mx-auto px-4 py-8 max-w-5xl flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-1">Cron Health</h1>
          <p className="text-sm text-muted-foreground">
            Sync status for all active telematics provider accounts.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? 'Refreshing...' : 'Refresh'}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map(i => <Skeleton key={i} style={{ height: 80, borderRadius: 8 }} />)}
        </div>
      ) : error ? (
        <div className="text-destructive text-sm">{(error as Error).message}</div>
      ) : data ? (
        <>
          {/* Summary row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-card border border-border rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-foreground">{data.total}</div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide mt-0.5">Total Accounts</div>
            </div>
            <div className="bg-card border border-border rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">{data.active}</div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide mt-0.5">Active</div>
            </div>
            <div className="bg-card border border-border rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-destructive">{data.error}</div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide mt-0.5">Error</div>
            </div>
            <div className="bg-card border border-border rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{data.staleCount}</div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide mt-0.5">Stale (&gt;26h)</div>
            </div>
          </div>

          {/* Accounts table */}
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted border-b border-border">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Org</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Provider</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Last Sync</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Age</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Last Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.accounts.map(account => (
                  <tr
                    key={`${account.clerkOrgId}-${account.provider}`}
                    className={`hover:bg-accent/50 transition-colors ${account.stale ? 'bg-amber-50/30 dark:bg-amber-900/10' : ''}`}
                  >
                    <td className="px-4 py-3 text-sm font-semibold text-foreground">
                      {account.orgName}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="text-xs">{account.provider}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      {account.status === 'ACTIVE' ? (
                        <Badge className="bg-green-600 hover:bg-green-600 text-xs">Active</Badge>
                      ) : account.status === 'ERROR' ? (
                        <Badge variant="destructive" className="text-xs">Error</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">{account.status}</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {account.lastSyncAt
                        ? new Date(account.lastSyncAt).toLocaleString()
                        : <span className="italic">Never</span>}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {account.lastSyncAgeHours === null ? (
                        <span className="text-muted-foreground italic">—</span>
                      ) : account.stale ? (
                        <span className="text-amber-600 dark:text-amber-400 font-medium">{account.lastSyncAgeHours}h ago</span>
                      ) : (
                        <span className="text-muted-foreground">{account.lastSyncAgeHours}h ago</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {account.lastError ? (
                        <button
                          onClick={() => setErrorModal(account.lastError)}
                          className="flex items-center gap-1.5 text-xs text-destructive hover:text-destructive/80 transition-colors group text-left"
                        >
                          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M12 3a9 9 0 110 18A9 9 0 0112 3z" /></svg>
                          <span className="max-w-[220px] truncate">{account.lastError}</span>
                          <span className="text-muted-foreground group-hover:text-foreground flex-shrink-0">↗</span>
                        </button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
                {data.accounts.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No provider accounts found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground text-right">
            Last refreshed: {new Date(data.timestamp).toLocaleString()} · Auto-refreshes every 60s
          </p>
        </>
      ) : null}

      {errorModal && <ErrorModal error={errorModal} onClose={() => setErrorModal(null)} />}
    </div>
  );
}
