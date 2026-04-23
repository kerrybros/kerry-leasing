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

interface CronRunStep {
  endpoint: string;
  newCount: number;
  updatedCount: number;
  unchangedCount: number;
  errorCount: number;
  recordCount: number;
  skipped: boolean;
  skipReason: string | null;
  /** HTTP routes for this step (from GET /admin/orgs/cron-runs). */
  apiPaths?: string[];
}

interface CronRunPass {
  clerkOrgId: string;
  orgName: string;
  date: string;
  verify: boolean;
  success: boolean;
  durationMs: number;
  error: string | null;
  steps: CronRunStep[];
}

interface CronRunRow {
  id: string;
  job: 'SAMSARA_DAILY' | 'MOTIVE_DAILY';
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  totalOrgs: number;
  successOrgs: number;
  failedOrgs: number;
  allSucceeded: boolean;
  report: { passes: CronRunPass[] };
}

interface CronRunsResponse {
  timestamp: string;
  runs: CronRunRow[];
}

/** One entry per org in a run (passes can repeat the same org for verify windows). */
function uniqueOrgsFromPasses(
  passes: Array<{ clerkOrgId: string; orgName: string }>
): Array<{ clerkOrgId: string; orgName: string }> {
  const seen = new Set<string>();
  const out: Array<{ clerkOrgId: string; orgName: string }> = [];
  for (const p of passes) {
    if (seen.has(p.clerkOrgId)) continue;
    seen.add(p.clerkOrgId);
    out.push({ clerkOrgId: p.clerkOrgId, orgName: p.orgName });
  }
  return out;
}

export default function CronHealthPage() {
  const { getApi } = useApiClient();
  const [errorModal, setErrorModal] = useState<string | null>(null);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  const { data, isLoading, error, refetch, isFetching } = useQuery<CronHealthResponse>({
    queryKey: ['cron-health'],
    queryFn: async () => {
      const api = await getApi();
      return api.get<CronHealthResponse>('/admin/orgs/cron-health');
    },
    refetchInterval: 60_000,
  });

  const { data: runsData, isLoading: runsLoading } = useQuery<CronRunsResponse>({
    queryKey: ['cron-runs'],
    queryFn: async () => {
      const api = await getApi();
      return api.get<CronRunsResponse>('/admin/orgs/cron-runs?limit=25');
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

          {/* Recent cron job runs (persisted summaries) */}
          <div className="mt-10">
            <h2 className="text-lg font-semibold mb-2">Recent cron runs</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Per-step database outcomes: rows inserted, left unchanged (no write), or updated. Expand a row for details.
            </p>
            {runsLoading ? (
              <Skeleton style={{ height: 120, borderRadius: 8 }} />
            ) : runsData?.runs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No runs recorded yet. Runs are saved after each Samsara/Motive daily job (Render cron or HTTP).</p>
            ) : (
              <div className="bg-card border border-border rounded-lg overflow-hidden divide-y divide-border">
                {runsData?.runs.map((run) => {
                  const open = expandedRunId === run.id;
                  const runOrgs = uniqueOrgsFromPasses(run.report.passes);
                  return (
                    <div key={run.id}>
                      <button
                        type="button"
                        className="w-full flex flex-col gap-2 px-4 py-3 text-left hover:bg-accent/50 transition-colors"
                        onClick={() => setExpandedRunId(open ? null : run.id)}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 w-full">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className="text-xs font-mono">{run.job.replace('_', ' ')}</Badge>
                            {run.allSucceeded ? (
                              <Badge className="bg-green-600 hover:bg-green-600 text-xs">All OK</Badge>
                            ) : (
                              <Badge variant="destructive" className="text-xs">{run.failedOrgs} org(s) failed</Badge>
                            )}
                            <span className="text-sm text-muted-foreground">
                              {new Date(run.startedAt).toLocaleString()}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
                            {Math.round(run.durationMs / 1000)}s · {run.successOrgs}/{run.totalOrgs} org passes OK
                            <span className="ml-1" aria-hidden>{open ? '▼' : '▶'}</span>
                          </div>
                        </div>
                        {runOrgs.length > 0 && (
                          <div className="text-xs w-full flex flex-col sm:flex-row sm:items-baseline gap-1.5 sm:gap-2">
                            <span className="text-[11px] uppercase tracking-wide text-muted-foreground shrink-0">Orgs</span>
                            <div className="flex flex-wrap gap-x-2 gap-y-1 items-baseline min-w-0">
                              {runOrgs.map((o, i) => (
                                <span key={o.clerkOrgId} className="inline-flex items-baseline gap-1 min-w-0 max-w-full">
                                  {i > 0 ? (
                                    <span className="text-border select-none" aria-hidden>
                                      ·
                                    </span>
                                  ) : null}
                                  {o.orgName !== o.clerkOrgId ? (
                                    <span className="min-w-0">
                                      <span className="text-foreground/90 font-medium">{o.orgName}</span>
                                      <span
                                        className="ml-1 font-mono text-[11px] text-muted-foreground break-all"
                                        title={o.clerkOrgId}
                                      >
                                        {o.clerkOrgId}
                                      </span>
                                    </span>
                                  ) : (
                                    <span
                                      className="font-mono text-[11px] text-foreground/90 break-all"
                                      title="Clerk org id"
                                    >
                                      {o.clerkOrgId}
                                    </span>
                                  )}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </button>
                      {open && (
                        <div className="px-4 pb-4 space-y-4 bg-muted/30">
                          {run.report.passes.map((p, idx) => (
                            <div key={`${p.clerkOrgId}-${p.date}-${p.verify}-${idx}`} className="border border-border rounded-md bg-background p-3 text-sm">
                              <div className="flex flex-wrap items-baseline gap-2 mb-2">
                                <span className="font-semibold">{p.orgName}</span>
                                {p.orgName !== p.clerkOrgId && (
                                  <span className="text-[11px] font-mono text-muted-foreground break-all">{p.clerkOrgId}</span>
                                )}
                                <Badge variant="secondary" className="text-xs">{p.date}</Badge>
                                {p.verify && <Badge variant="outline" className="text-xs">verify</Badge>}
                                {p.success ? (
                                  <Badge className="bg-green-600 hover:bg-green-600 text-xs">pass</Badge>
                                ) : (
                                  <Badge variant="destructive" className="text-xs">fail</Badge>
                                )}
                                <span className="text-xs text-muted-foreground">{p.durationMs}ms</span>
                              </div>
                              {p.error && (
                                <pre className="text-xs text-destructive whitespace-pre-wrap mb-2 font-mono">{p.error}</pre>
                              )}
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-left text-muted-foreground border-b border-border">
                                    <th className="py-1 pr-2">Step</th>
                                    <th className="py-1 pr-2">Insert</th>
                                    <th className="py-1 pr-2">Unchanged</th>
                                    <th className="py-1 pr-2">Updated</th>
                                    <th className="py-1 pr-2">Err</th>
                                    <th className="py-1">Note</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {p.steps.map((s, stepIdx) => (
                                    <tr key={`${s.endpoint}-${stepIdx}`} className="border-b border-border/60 align-top">
                                      <td className="py-1 pr-2">
                                        <div className="font-mono">{s.endpoint}</div>
                                        {s.apiPaths && s.apiPaths.length > 0 ? (
                                          <details className="mt-1.5">
                                            <summary className="cursor-pointer list-none text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden text-[11px] underline-offset-2 hover:underline">
                                              Routes ({s.apiPaths.length})
                                            </summary>
                                            <ul className="mt-1.5 pl-4 space-y-0.5 list-disc text-[11px] text-muted-foreground font-mono break-all">
                                              {s.apiPaths.map((path) => (
                                                <li key={path}>{path}</li>
                                              ))}
                                            </ul>
                                          </details>
                                        ) : null}
                                      </td>
                                      <td className="py-1 pr-2">{s.newCount}</td>
                                      <td className="py-1 pr-2">{s.unchangedCount}</td>
                                      <td className="py-1 pr-2">{s.updatedCount}</td>
                                      <td className="py-1 pr-2">{s.errorCount}</td>
                                      <td className="py-1 text-muted-foreground">
                                        {s.skipped && s.skipReason ? s.skipReason : '—'}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      ) : null}

      {errorModal && <ErrorModal error={errorModal} onClose={() => setErrorModal(null)} />}
    </div>
  );
}
