'use client';

import { useOrganization } from '@clerk/nextjs';
import { useEffect, useState } from 'react';
import { useApiClient } from '@/hooks/useApiClient';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/Skeleton';

interface RepairCustomerConfig {
  klOrgId: string;
  customerName: string;
  contractStartDate: string;
  updatedAt: string;
}

export default function AdminOrgSettingsPage() {
  const { organization } = useOrganization();
  const { getApi } = useApiClient();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [contractStartDate, setContractStartDate] = useState('');
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!organization?.id) return;
    loadConfig();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organization?.id]);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const api = await getApi();
      const res = await api.get<{ config: RepairCustomerConfig | null }>('/admin/repair-customer');
      const config = res?.config ?? null;
      setCustomerName(config?.customerName ?? '');
      setContractStartDate(config?.contractStartDate ?? '');
    } catch (err: unknown) {
      setStatusMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed to load settings' });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = (customerName ?? '').trim();
    if (!organization?.id || !name || !contractStartDate) return;
    try {
      setSaving(true);
      setStatusMsg(null);
      const api = await getApi();
      await api.put('/admin/repair-customer', { customerName: name, contractStartDate });
      setStatusMsg({ type: 'success', text: 'Settings saved.' });
      setTimeout(() => setStatusMsg(null), 5000);
      await loadConfig();
    } catch (err: unknown) {
      setStatusMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-xl flex flex-col gap-4">
        <Skeleton style={{ height: 32, width: '40%', borderRadius: 8 }} />
        <Skeleton style={{ height: 200, borderRadius: 8 }} />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-1">Org Settings</h1>
        <p className="text-sm text-muted-foreground">
          Customer name and contract start date for{' '}
          <span className="font-semibold text-foreground">{organization?.name}</span>.
          This date is used as the reference for repair and telematics data ranges.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div>
              <label className="text-sm font-medium mb-2 block">Customer Name</label>
              <Input
                type="text"
                value={customerName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCustomerName(e.target.value)}
                placeholder="e.g. Wolverine"
                required
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Contract Start Date</label>
              <Input
                type="date"
                value={contractStartDate}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setContractStartDate(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground mt-1">
                Used as the start of the data range for repairs and telematics.
              </p>
            </div>

            <div className="flex items-center gap-4">
              <Button
                type="submit"
                disabled={saving || !customerName.trim() || !contractStartDate}
              >
                {saving ? 'Saving...' : 'Save Settings'}
              </Button>
              {statusMsg && (
                <p className={`text-sm ${statusMsg.type === 'success' ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
                  {statusMsg.text}
                </p>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
