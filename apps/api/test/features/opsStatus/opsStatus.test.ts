import { describe, it, expect } from 'vitest';
import {
  integrationStatus,
  formatIntegrationStatusLines,
} from '../../../src/features/opsStatus/opsStatus.js';

const base = {
  twilioConfigured: true,
  smsDryRun: false,
  graphConfigured: true,
  emailDryRun: false,
  reportEmailFrom: 'reports@kerrybros.com',
  weeklyDriverSmsEnabled: true,
};

describe('integrationStatus', () => {
  it('maps dry-run flags to live/dry-run modes', () => {
    expect(integrationStatus({ ...base, smsDryRun: true }).sms.mode).toBe('dry-run');
    expect(integrationStatus({ ...base, smsDryRun: false }).sms.mode).toBe('live');
    expect(integrationStatus({ ...base, emailDryRun: true }).email.mode).toBe('dry-run');
    expect(integrationStatus({ ...base, emailDryRun: false }).email.mode).toBe('live');
  });

  it('reflects the weekly master switch', () => {
    expect(integrationStatus({ ...base, weeklyDriverSmsEnabled: false }).weeklyDriverReports.masterSwitch).toBe('off');
    expect(integrationStatus(base).weeklyDriverReports.masterSwitch).toBe('on');
  });

  it('surfaces configured flags + the from address, no secrets', () => {
    const s = integrationStatus({ ...base, twilioConfigured: false, graphConfigured: false });
    expect(s.sms.twilioConfigured).toBe(false);
    expect(s.email.graphConfigured).toBe(false);
    expect(s.email.from).toBe('reports@kerrybros.com');
    // structurally there's nowhere for a secret to live — only booleans + from
    expect(Object.keys(s.sms)).toEqual(['mode', 'twilioConfigured']);
  });
});

describe('formatIntegrationStatusLines', () => {
  it('renders readable one-liners', () => {
    const lines = formatIntegrationStatusLines(
      integrationStatus({ ...base, smsDryRun: true, twilioConfigured: false }),
    );
    expect(lines[0]).toContain('SMS: DRY-RUN');
    expect(lines[0]).toContain('Twilio not configured');
    expect(lines.join('\n')).toContain('master switch ON');
    expect(lines.join('\n')).toContain('reports@kerrybros.com');
  });
});
