/**
 * Integration/feature readiness — pure and secret-free. Answers, at a glance,
 * the questions that ate a lot of time to answer ad-hoc: is SMS live or dry-run?
 * is email live? is the weekly-report master switch on? are Twilio/Graph even
 * configured? Surfaced in the startup log and via GET /admin/ops-status.
 *
 * Takes plain booleans (not the config object) so it stays config-free and
 * unit-testable, and so it can never accidentally leak a secret value.
 */

export interface IntegrationInput {
  twilioConfigured: boolean;
  smsDryRun: boolean;
  graphConfigured: boolean;
  emailDryRun: boolean;
  reportEmailFrom: string | null;
  weeklyDriverSmsEnabled: boolean;
}

export interface IntegrationStatus {
  sms: { mode: 'live' | 'dry-run'; twilioConfigured: boolean };
  email: { mode: 'live' | 'dry-run'; graphConfigured: boolean; from: string | null };
  weeklyDriverReports: { masterSwitch: 'on' | 'off' };
}

export function integrationStatus(i: IntegrationInput): IntegrationStatus {
  return {
    sms: { mode: i.smsDryRun ? 'dry-run' : 'live', twilioConfigured: i.twilioConfigured },
    email: {
      mode: i.emailDryRun ? 'dry-run' : 'live',
      graphConfigured: i.graphConfigured,
      from: i.reportEmailFrom,
    },
    weeklyDriverReports: { masterSwitch: i.weeklyDriverSmsEnabled ? 'on' : 'off' },
  };
}

/** Human-readable one-liners for the startup log. */
export function formatIntegrationStatusLines(s: IntegrationStatus): string[] {
  return [
    `SMS: ${s.sms.mode.toUpperCase()}` + (s.sms.twilioConfigured ? '' : ' — Twilio not configured'),
    `Email: ${s.email.mode.toUpperCase()}` +
      (s.email.from ? ` from ${s.email.from}` : '') +
      (s.email.graphConfigured ? '' : ' — Graph not configured'),
    `Weekly driver reports: master switch ${s.weeklyDriverReports.masterSwitch.toUpperCase()}`,
  ];
}
