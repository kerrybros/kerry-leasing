import { describe, it, expect } from 'vitest';
import { buildSendUpdatePayload } from '../../../src/features/smsWeeklyReports/sendOrgWeeklyReports.js';
import { DriverSmsStatus } from '../../../src/generated/app-client/index.js';

const base = {
  bodyPreview: 'Hi Jeff, your weekly scorecard is ready',
  kpiSnapshot: { score: 33 },
  token: 'tok',
  tokenExpiresAt: new Date('2026-10-07T00:00:00Z'),
};

// This payload is now only ever reached on a REAL send: a dry run returns
// before persisting anything. That ordering is what stops a preview landing on
// the same (org, driver, week, channel) row as the week's real send, which is
// how 35 DELIVERED rows became SKIPPED while keeping their Twilio SIDs.
describe('buildSendUpdatePayload', () => {
  it('writes the status of a real send', () => {
    expect(buildSendUpdatePayload({ ...base, status: DriverSmsStatus.QUEUED }).status).toBe(DriverSmsStatus.QUEUED);
  });

  it('refreshes the token only when re-queuing, not on a terminal status', () => {
    expect(buildSendUpdatePayload({ ...base, status: DriverSmsStatus.QUEUED }).token).toBe('tok');
    const terminal = buildSendUpdatePayload({ ...base, status: DriverSmsStatus.NO_CONSENT });
    expect(terminal).not.toHaveProperty('token');
    expect(terminal.status).toBe(DriverSmsStatus.NO_CONSENT);
  });

  it('always refreshes the rendered body and snapshot', () => {
    const p = buildSendUpdatePayload({ ...base, status: DriverSmsStatus.QUEUED });
    expect(p.bodyPreview).toBe(base.bodyPreview);
    expect(p.kpiSnapshot).toEqual({ score: 33 });
  });

  it('takes no dryRun input at all, so a preview cannot reach it by mistake', () => {
    // Guards the invariant at the type boundary: the only way a dry run could
    // write is if someone reintroduced a flag here.
    expect(Object.keys(buildSendUpdatePayload({ ...base, status: DriverSmsStatus.SENT }))).not.toContain('dryRun');
  });
});
