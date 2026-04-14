'use client';

import { useEffect, useState, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/Skeleton';
import { useApiClient } from '@/hooks/useApiClient';
import { AddCustomerDrawer } from '@/features/admin/components/AddCustomerDrawer';

interface OrgRow {
  clerkOrgId: string;
  displayName: string | null;
  provider: 'MOTIVE' | 'SAMSARA';
  status: 'ACTIVE' | 'ERROR' | 'DISABLED';
  lastSyncAt: string | null;
  lastError: string | null;
  vehicleCount: number;
  repairCustomerName: string | null;
  contractStartDate: string | null;
  tracksDrivers: boolean;
  contractTermYears: number | null;
  createdAt: string;
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return 'Just now';
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function StatusBadge({ status }: { status: OrgRow['status'] }) {
  const styles: Record<OrgRow['status'], string> = {
    ACTIVE: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    ERROR: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    DISABLED: 'bg-muted text-muted-foreground',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${styles[status]}`}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}

function ProviderBadge({ provider }: { provider: OrgRow['provider'] }) {
  return (
    <Badge variant="outline" className="text-xs font-medium">
      {provider === 'MOTIVE' ? 'Motive' : 'Samsara'}
    </Badge>
  );
}

function ErrorModal({ error, onClose }: { error: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(error);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg mx-4 rounded-xl border border-border bg-background shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-sm font-semibold text-foreground">Last Error</span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-muted"
            >
              {copied ? (
                <>
                  <svg className="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-green-500">Copied</span>
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Copy
                </>
              )}
            </button>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded hover:bg-muted"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        <pre className="px-4 py-3 text-xs text-destructive whitespace-pre-wrap break-all font-mono max-h-72 overflow-y-auto">
          {error}
        </pre>
      </div>
    </div>
  );
}

export default function CustomersPage() {
  const { getApi } = useApiClient();
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [errorModal, setErrorModal] = useState<string | null>(null);

  const loadOrgs = useCallback(async () => {
    setLoading(true);
    try {
      const api = await getApi();
      const data = await api.get<{ orgs: OrgRow[] }>('/admin/orgs');
      setOrgs(data.orgs ?? []);
    } catch {
      setOrgs([]);
    } finally {
      setLoading(false);
    }
  }, [getApi]);

  useEffect(() => { loadOrgs(); }, [loadOrgs]);

  return (
    <div className="mx-auto px-4 py-8 max-w-[1200px] flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold mb-1">Customers</h1>
          <p className="text-sm text-muted-foreground">
            Manage customer orgs, telematics providers, and repair data links.
          </p>
        </div>
        <Button onClick={() => setDrawerOpen(true)} className="flex-shrink-0">
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Customer
        </Button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex flex-col gap-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} style={{ height: 60, borderRadius: 8 }} />
          ))}
        </div>
      ) : orgs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-foreground mb-1">No customers yet</p>
          <p className="text-xs text-muted-foreground mb-4">Add your first customer to get started.</p>
          <Button onClick={() => setDrawerOpen(true)} size="sm">Add Customer</Button>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Customer</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Provider</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Last Sync</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Repair Link</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Last Error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {orgs.map((org) => (
                <tr key={org.clerkOrgId} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{org.displayName ?? org.clerkOrgId}</p>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">{org.clerkOrgId}</p>
                  </td>
                  <td className="px-4 py-3">
                    <ProviderBadge provider={org.provider} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={org.status} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {timeAgo(org.lastSyncAt)}
                  </td>
                  <td className="px-4 py-3">
                    {org.repairCustomerName ? (
                      <span className="text-xs font-medium text-foreground">{org.repairCustomerName}</span>
                    ) : (
                      <span className="text-xs text-muted-foreground italic">Not linked</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {org.lastError ? (
                      <button
                        onClick={() => setErrorModal(org.lastError)}
                        className="flex items-center gap-1.5 text-xs text-destructive hover:text-destructive/80 transition-colors group"
                      >
                        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M12 3a9 9 0 110 18A9 9 0 0112 3z" />
                        </svg>
                        <span className="max-w-[180px] truncate">{org.lastError}</span>
                        <span className="text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0">↗</span>
                      </button>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AddCustomerDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onCreated={() => { setDrawerOpen(false); loadOrgs(); }}
      />

      {errorModal && (
        <ErrorModal error={errorModal} onClose={() => setErrorModal(null)} />
      )}
    </div>
  );
}
