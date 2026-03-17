'use client';

import { useOrganization } from '@clerk/nextjs';
import { useEffect, useState } from 'react';
import { useApiClient } from '@/hooks/useApiClient';

interface RepairCustomerConfig {
  klOrgId: string;
  customerName: string;
  contractStartDate: string;
  updatedAt: string;
}

export default function AdminOrgSettingsPage() {
  const { organization } = useOrganization();
  const { getApi } = useApiClient();

  const [config, setConfig] = useState<RepairCustomerConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [contractStartDate, setContractStartDate] = useState('');
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!organization?.id) return;
    loadConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organization?.id]);

  const loadConfig = async () => {
    try {
      setLoading(true);
      setError(null);
      const api = await getApi();
      const res = await api.get<{ config: RepairCustomerConfig | null }>('/admin/repair-customer');
      const configData = res?.config ?? null;
      setConfig(configData);
      setCustomerName(configData?.customerName ?? '');
      setContractStartDate(configData?.contractStartDate ?? '');
    } catch (err: any) {
      setError(err.message || 'Failed to load settings');
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
      setError(null);
      setSaveSuccess(null);

      const api = await getApi();
      await api.put('/admin/repair-customer', {
        customerName: name,
        contractStartDate,
      });

      setSaveSuccess('Org settings saved successfully.');
      await loadConfig();
    } catch (err: any) {
      setError(err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">Loading org settings...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Org Settings</h1>
        <p className="text-text-secondary">
          Customer name and contract start date for{' '}
          <span className="font-semibold">{organization?.name}</span>. This date is used as the
          reference for data timeframes (repairs and telematics).
        </p>
      </div>

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

      <form onSubmit={handleSubmit} className="bg-bg-secondary border border-border rounded-lg p-6 max-w-lg">
        <div className="flex flex-col gap-5">
          <div>
            <label className="block text-sm font-medium mb-2">Customer Name</label>
            <input
              type="text"
              value={customerName ?? ''}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="e.g. Wolverine"
              className="w-full px-3 py-2 bg-bg-primary border border-border rounded-lg text-sm focus:outline-none focus:border-primary"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Contract Start Date</label>
            <input
              type="date"
              value={contractStartDate ?? ''}
              onChange={(e) => setContractStartDate(e.target.value)}
              className="w-full px-3 py-2 bg-bg-primary border border-border rounded-lg text-sm focus:outline-none focus:border-primary"
              required
            />
            <p className="text-xs text-text-secondary mt-1">
              Used as the start of the date range for repair and telematics data.
            </p>
          </div>

          <button
            type="submit"
            disabled={saving || !(customerName ?? '').trim() || !contractStartDate}
            className="w-fit px-5 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark disabled:opacity-50 text-sm font-medium"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>
    </div>
  );
}
