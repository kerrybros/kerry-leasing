'use client';

import { useState, useEffect, useCallback } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useApiClient } from '@/hooks/useApiClient';

type Provider = 'MOTIVE' | 'SAMSARA';

interface RepairCustomer {
  id: string;
  name: string;
}

interface AddCustomerDrawerProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const STEPS = ['Identity', 'Telematics', 'Settings'] as const;
type Step = 0 | 1 | 2;

export function AddCustomerDrawer({ open, onClose, onCreated }: AddCustomerDrawerProps) {
  const { getApi } = useApiClient();

  // Step navigation
  const [step, setStep] = useState<Step>(0);

  // Step 1 — Identity
  const [displayName, setDisplayName] = useState('');
  const [contractStartDate, setContractStartDate] = useState('');
  const [repairCustomerSearch, setRepairCustomerSearch] = useState('');
  const [selectedRepairCustomer, setSelectedRepairCustomer] = useState<RepairCustomer | null>(null);
  const [repairCustomers, setRepairCustomers] = useState<RepairCustomer[]>([]);
  const [repairLoading, setRepairLoading] = useState(false);
  const [repairDropdownOpen, setRepairDropdownOpen] = useState(false);

  // Step 2 — Telematics
  const [provider, setProvider] = useState<Provider>('MOTIVE');
  const [apiKey, setApiKey] = useState('');
  const [validating, setValidating] = useState(false);
  const [credentialStatus, setCredentialStatus] = useState<'idle' | 'valid' | 'invalid'>('idle');
  const [credentialError, setCredentialError] = useState<string | null>(null);

  // Step 3 — Settings
  const [tracksDrivers, setTracksDrivers] = useState(true);
  const [contractTermYears, setContractTermYears] = useState<string>('');
  const [serviceRequestUrl, setServiceRequestUrl] = useState('');

  // Submit
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Fetch repair customers once the drawer opens
  useEffect(() => {
    if (!open) return;
    setRepairLoading(true);
    getApi()
      .then((api) => api.get<{ customers: RepairCustomer[] }>('/admin/orgs/repair-customers'))
      .then((data) => setRepairCustomers(data.customers ?? []))
      .catch(() => setRepairCustomers([]))
      .finally(() => setRepairLoading(false));
  }, [open, getApi]);

  // Reset everything when drawer closes
  useEffect(() => {
    if (!open) {
      setStep(0);
      setDisplayName('');
      setContractStartDate('');
      setRepairCustomerSearch('');
      setSelectedRepairCustomer(null);
      setProvider('MOTIVE');
      setApiKey('');
      setCredentialStatus('idle');
      setCredentialError(null);
      setTracksDrivers(true);
      setContractTermYears('');
      setServiceRequestUrl('');
      setSubmitError(null);
    }
  }, [open]);

  const filteredRepairCustomers = repairCustomers.filter((c) =>
    c.name.toLowerCase().includes(repairCustomerSearch.toLowerCase())
  );

  const handleValidateCredentials = useCallback(async () => {
    if (!apiKey.trim()) return;
    setValidating(true);
    setCredentialStatus('idle');
    setCredentialError(null);
    try {
      const api = await getApi();
      const result = await api.post<{ valid: boolean; error?: string }>(
        '/admin/orgs/validate-credentials',
        { provider, apiKey: apiKey.trim() }
      );
      if (result.valid) {
        setCredentialStatus('valid');
      } else {
        setCredentialStatus('invalid');
        setCredentialError(result.error ?? 'Invalid credentials');
      }
    } catch (err: any) {
      setCredentialStatus('invalid');
      setCredentialError(err.message ?? 'Credential check failed');
    } finally {
      setValidating(false);
    }
  }, [apiKey, provider, getApi]);

  // Reset credential status if provider or apiKey changes
  useEffect(() => {
    setCredentialStatus('idle');
    setCredentialError(null);
  }, [provider, apiKey]);

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const api = await getApi();
      await api.post('/admin/orgs/create', {
        displayName: displayName.trim(),
        provider,
        apiKey: apiKey.trim(),
        contractStartDate,
        repairCustomerId: selectedRepairCustomer?.id ?? undefined,
        repairCustomerName: selectedRepairCustomer?.name ?? undefined,
        tracksDrivers,
        contractTermYears: contractTermYears && contractTermYears !== 'none' ? parseInt(contractTermYears, 10) : undefined,
        serviceRequestUrl: serviceRequestUrl.trim() || undefined,
      });
      onCreated();
      onClose();
    } catch (err: any) {
      setSubmitError(err.message ?? 'Failed to create customer');
    } finally {
      setSubmitting(false);
    }
  };

  const step1Valid = displayName.trim().length > 0 && contractStartDate.length > 0;
  const step2Valid = credentialStatus === 'valid';

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col gap-0 p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border">
          <SheetTitle>Add Customer</SheetTitle>
          <SheetDescription>
            Set up a new customer org — Clerk org, telematics, and repair data are all configured here.
          </SheetDescription>
          {/* Step indicator */}
          <div className="flex gap-2 pt-3">
            {STEPS.map((label, i) => (
              <div key={label} className="flex items-center gap-2">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
                    i < step
                      ? 'bg-primary text-primary-foreground'
                      : i === step
                      ? 'bg-primary text-primary-foreground ring-2 ring-primary/30'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {i < step ? (
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </div>
                <span className={`text-xs font-medium ${i === step ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {label}
                </span>
                {i < STEPS.length - 1 && <div className="w-6 h-px bg-border mx-1" />}
              </div>
            ))}
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          {/* ── Step 1: Identity ───────────────────────────────────────── */}
          {step === 0 && (
            <div className="flex flex-col gap-5">
              <div>
                <label className="text-sm font-medium block mb-1.5">Customer Display Name <span className="text-destructive">*</span></label>
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Wolverine Packing"
                />
                <p className="text-xs text-muted-foreground mt-1">Used as the Clerk organization name.</p>
              </div>

              <div>
                <label className="text-sm font-medium block mb-1.5">Contract Start Date <span className="text-destructive">*</span></label>
                <Input
                  type="date"
                  value={contractStartDate}
                  onChange={(e) => setContractStartDate(e.target.value)}
                  className="w-auto"
                />
                <p className="text-xs text-muted-foreground mt-1">Historical data will be backfilled from this date.</p>
              </div>

              <div>
                <label className="text-sm font-medium block mb-1.5">Repair Customer</label>
                {selectedRepairCustomer ? (
                  <div className="flex items-center gap-2 p-2.5 border border-border rounded-lg bg-muted/40">
                    <svg className="w-4 h-4 text-primary flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-sm font-medium flex-1">{selectedRepairCustomer.name}</span>
                    <button
                      type="button"
                      onClick={() => { setSelectedRepairCustomer(null); setRepairCustomerSearch(''); }}
                      className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <Input
                      value={repairCustomerSearch}
                      onChange={(e) => { setRepairCustomerSearch(e.target.value); setRepairDropdownOpen(true); }}
                      onFocus={() => setRepairDropdownOpen(true)}
                      placeholder={repairLoading ? 'Loading customers...' : 'Search repair customers...'}
                      disabled={repairLoading}
                    />
                    {repairDropdownOpen && repairCustomerSearch.length > 0 && (
                      <div className="absolute z-50 w-full mt-1 bg-background border border-border rounded-lg shadow-lg max-h-52 overflow-y-auto">
                        {filteredRepairCustomers.length === 0 ? (
                          <p className="text-sm text-muted-foreground px-3 py-2">No matches found.</p>
                        ) : (
                          filteredRepairCustomers.slice(0, 10).map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors"
                              onClick={() => {
                                setSelectedRepairCustomer(c);
                                setRepairCustomerSearch('');
                                setRepairDropdownOpen(false);
                              }}
                            >
                              {c.name}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-1">Links this org to repair orders in the service database.</p>
              </div>
            </div>
          )}

          {/* ── Step 2: Telematics ─────────────────────────────────────── */}
          {step === 1 && (
            <div className="flex flex-col gap-5">
              <div>
                <label className="text-sm font-medium block mb-2">Provider <span className="text-destructive">*</span></label>
                <div className="flex gap-3">
                  {(['MOTIVE', 'SAMSARA'] as Provider[]).map((p) => (
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
                <label className="text-sm font-medium block mb-1.5">
                  {provider === 'MOTIVE' ? 'Motive API Key' : 'Samsara API Token'} <span className="text-destructive">*</span>
                </label>
                <Input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={provider === 'MOTIVE' ? 'Enter Motive API key...' : 'Enter Samsara API token...'}
                />
                <p className="text-xs text-muted-foreground mt-1">Encrypted with AES-256-GCM before storage.</p>
              </div>

              {/* Credential validation */}
              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleValidateCredentials}
                  disabled={!apiKey.trim() || validating}
                  className="w-fit"
                >
                  {validating ? (
                    <>
                      <svg className="w-4 h-4 mr-2 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Checking...
                    </>
                  ) : (
                    'Test Credentials'
                  )}
                </Button>

                {credentialStatus === 'valid' && (
                  <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Credentials verified — connection successful.
                  </div>
                )}
                {credentialStatus === 'invalid' && (
                  <div className="flex items-start gap-2 text-sm text-destructive">
                    <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    {credentialError ?? 'Invalid credentials. Check the key and try again.'}
                  </div>
                )}
                {credentialStatus === 'idle' && apiKey.trim() && (
                  <p className="text-xs text-muted-foreground">Credentials must be verified before proceeding.</p>
                )}
              </div>
            </div>
          )}

          {/* ── Step 3: Settings + Review ──────────────────────────────── */}
          {step === 2 && (
            <div className="flex flex-col gap-5">
              <div className="flex items-center justify-between py-3 border-b border-border">
                <div>
                  <p className="text-sm font-medium">Driver Tracking</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Enables driver utilization reports and scorecards.</p>
                </div>
                <Switch checked={tracksDrivers} onCheckedChange={setTracksDrivers} />
              </div>

              <div>
                <label className="text-sm font-medium block mb-1.5">Service Request URL</label>
                <Input
                  type="url"
                  value={serviceRequestUrl}
                  onChange={(e) => setServiceRequestUrl(e.target.value)}
                  placeholder="https://..."
                />
                <p className="text-xs text-muted-foreground mt-1">FullBay or external portal link shown to the customer.</p>
              </div>

              <div>
                <label className="text-sm font-medium block mb-1.5">Contract Term</label>
                <Select value={contractTermYears} onValueChange={(v) => { if (v !== null) setContractTermYears(v); }}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Select term..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No fixed term</SelectItem>
                    {[1, 2, 3, 4, 5].map((y) => (
                      <SelectItem key={y} value={String(y)}>{y} {y === 1 ? 'year' : 'years'}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Review summary */}
              <div className="mt-2 rounded-lg border border-border bg-muted/30 p-4 flex flex-col gap-2.5 text-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Review</p>
                <ReviewRow label="Customer" value={displayName} />
                <ReviewRow label="Provider" value={provider} />
                <ReviewRow label="Contract start" value={contractStartDate} />
                {selectedRepairCustomer && (
                  <ReviewRow label="Repair customer" value={selectedRepairCustomer.name} />
                )}
                <ReviewRow label="Driver tracking" value={tracksDrivers ? 'Enabled' : 'Disabled'} />
                {serviceRequestUrl.trim() && (
                  <ReviewRow label="Service request URL" value={serviceRequestUrl.trim()} />
                )}
                {contractTermYears && contractTermYears !== 'none' && (
                  <ReviewRow label="Contract term" value={`${contractTermYears} ${parseInt(contractTermYears) === 1 ? 'year' : 'years'}`} />
                )}
                <div className="pt-1 mt-1 border-t border-border text-xs text-muted-foreground">
                  A backdate will run in the background from <span className="font-medium text-foreground">{contractStartDate}</span> to today after saving.
                </div>
              </div>

              {submitError && (
                <p className="text-sm text-destructive">{submitError}</p>
              )}
            </div>
          )}
        </div>

        {/* Footer nav */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => step > 0 ? setStep((step - 1) as Step) : onClose()}
            disabled={submitting}
          >
            {step === 0 ? 'Cancel' : 'Back'}
          </Button>

          {step < 2 ? (
            <Button
              onClick={() => setStep((step + 1) as Step)}
              disabled={
                (step === 0 && !step1Valid) ||
                (step === 1 && !step2Valid)
              }
            >
              Continue
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Creating...' : 'Create Customer'}
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}
