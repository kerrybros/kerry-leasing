import { describe, it, expect } from 'vitest';
import { buildSendUpdatePayload } from '../../../src/features/smsWeeklyReports/sendOrgWeeklyReports.js';
import { DriverSmsStatus } from '../../../src/generated/app-client/index.js';

const base = {
  bodyPreview: 'Hi Jeff, your weekly scorecard is ready',
  kpiSnapshot: { score: 33 },
  token: 'tok',
  tokenExpiresAt: new Date('2026-10-07T00:00:00Z'),
};

describe('buildSendUpdatePayload', () => {
  it('never writes status on a dry run', () => {
    // The regression: the unique key is (org, driver, week, channel), so a
    // preview lands on the SAME row as that week's real send. Writing status
    // here turned 35 DELIVERED rows into SKIPPED for the week of 2026-09-21
    // while leaving their Twilio SIDs in place.
    const p = buildSendUpdatePayload({ ...base, dryRun: true, status: DriverSmsStatus.SKIPPED });
    expect(p).not.toHaveProperty('status');
    expect(p).not.toHaveProperty('token');
  });

  it('still refreshes the rendered body on a dry run, which is harmless', () => {
    const p = buildSendUpdatePayload({ ...base, dryRun: true, status: DriverSmsStatus.SKIPPED });
    expect(p.bodyPreview).toBe(base.bodyPreview);
    expect(p.kpiSnapshot).toEqual({ score: 33 });
  });

  it('writes status on a real run', () => {
    const p = buildSendUpdatePayload({ ...base, dryRun: false, status: DriverSmsStatus.QUEUED });
    expect(p.status).toBe(DriverSmsStatus.QUEUED);
  });

  it('refreshes the token only when re-queuing, not on a terminal status', () => {
    const queued = buildSendUpdatePayload({ ...base, dryRun: false, status: DriverSmsStatus.QUEUED });
    expect(queued.token).toBe('tok');
    const noConsent = buildSendUpdatePayload({ ...base, dryRun: false, status: DriverSmsStatus.NO_CONSENT });
    expect(noConsent).not.toHaveProperty('token');
    expect(noConsent.status).toBe(DriverSmsStatus.NO_CONSENT);
  });

  it('a dry run cannot downgrade any real status, whatever it computed', () => {
    for (const s of [DriverSmsStatus.SKIPPED, DriverSmsStatus.NO_CONSENT, DriverSmsStatus.NO_PHONE]) {
      expect(buildSendUpdatePayload({ ...base, dryRun: true, status: s })).not.toHaveProperty('status');
    }
  });
});
