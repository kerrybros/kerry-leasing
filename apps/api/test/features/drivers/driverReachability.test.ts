import { describe, it, expect } from 'vitest';
import {
  reasonFor,
  evaluateDriverReachability,
  formatReachabilityAlert,
  type DriverReachabilityInput,
  type StalePhoneHolder,
} from '../../../src/features/drivers/driverReachability.js';

const reachable = (over: Partial<DriverReachabilityInput> = {}): DriverReachabilityInput => ({
  clerkOrgId: 'org', motiveDriverId: 1, displayName: 'Working Driver', activeDays: 5,
  hasContact: true, hasPhone: true, enrolled: true, optedOut: false, consentConfirmed: true, ...over,
});

describe('reasonFor', () => {
  it('returns null when a driver can actually be reached', () => {
    expect(reasonFor(reachable())).toBeNull();
  });

  it('names each blocking condition', () => {
    expect(reasonFor(reachable({ hasContact: false }))).toBe('no-contact-record');
    expect(reasonFor(reachable({ enrolled: false }))).toBe('not-enrolled');
    expect(reasonFor(reachable({ optedOut: true }))).toBe('opted-out');
    expect(reasonFor(reachable({ hasPhone: false }))).toBe('no-phone');
    expect(reasonFor(reachable({ consentConfirmed: false }))).toBe('no-consent');
  });

  it('reports the most fundamental cause, not a symptom of it', () => {
    // A driver with no contact row also has no phone and no consent. Saying
    // "no phone" would send someone to fix the wrong thing.
    const noContact = reachable({ hasContact: false, hasPhone: false, consentConfirmed: false, enrolled: false });
    expect(reasonFor(noContact)).toBe('no-contact-record');
  });

  it('catches the exact case that went unnoticed for months', () => {
    // Ezekiel King-Davis: contact existed, enrolled, not opted out, but his
    // phone was held by a departed driver so the sync left the field empty.
    const ezekiel = reachable({ displayName: 'Ezekiel King-Davis', hasPhone: false, consentConfirmed: false, activeDays: 11 });
    expect(reasonFor(ezekiel)).toBe('no-phone');
  });
});

describe('evaluateDriverReachability', () => {
  it('lists the worst offender first, by days driven unheard', () => {
    const r = evaluateDriverReachability([
      reachable({ displayName: 'Two Days', hasPhone: false, activeDays: 2 }),
      reachable({ displayName: 'Twelve Days', hasPhone: false, activeDays: 12 }),
      reachable({ displayName: 'Fine', activeDays: 9 }),
    ], [], 14);
    expect(r.unreachable.map((u) => u.displayName)).toEqual(['Twelve Days', 'Two Days']);
    expect(r.driversChecked).toBe(3);
  });
});

describe('formatReachabilityAlert', () => {
  it('stays silent when everyone is reachable', () => {
    expect(formatReachabilityAlert(evaluateDriverReachability([reachable()], [], 14))).toBeNull();
  });

  it('names the driver, the days driven and the fix', () => {
    const r = evaluateDriverReachability(
      [reachable({ displayName: 'Ezekiel King-Davis', hasPhone: false, activeDays: 11 })], [], 14);
    const alert = formatReachabilityAlert(r)!;
    expect(alert.subject).toContain('1 driver');
    expect(alert.text).toContain('Ezekiel King-Davis');
    expect(alert.text).toContain('11 days');
    expect(alert.text).toContain('no phone number on file');
    expect(alert.html).toContain('Ezekiel King-Davis');
  });

  it('uses singular wording for one driver and one day', () => {
    const r = evaluateDriverReachability([reachable({ hasPhone: false, activeDays: 1 })], [], 14);
    expect(formatReachabilityAlert(r)!.text).toContain('drove 1 day in');
  });

  it('raises a stranded phone even when every driver is reachable', () => {
    const stale: StalePhoneHolder[] = [
      { clerkOrgId: 'org', displayName: 'AJ Rozycki', phoneLast4: '7367', motiveStatus: 'deactivated' },
    ];
    const alert = formatReachabilityAlert(evaluateDriverReachability([reachable()], stale, 14))!;
    expect(alert.subject).toContain('phone number');
    expect(alert.text).toContain('AJ Rozycki');
    expect(alert.text).toContain('7367');
    expect(alert.text).toContain('Whiparound');
  });

  it('reports both problems together when both exist', () => {
    const r = evaluateDriverReachability(
      [reachable({ displayName: 'Jamie Shell', hasPhone: false, activeDays: 6 })],
      [{ clerkOrgId: 'org', displayName: 'Dominic Ricci', phoneLast4: '7347', motiveStatus: 'deactivated' }],
      14);
    const alert = formatReachabilityAlert(r)!;
    expect(alert.subject).toContain('1 driver');
    expect(alert.text).toContain('Jamie Shell');
    expect(alert.text).toContain('Dominic Ricci');
  });
});
