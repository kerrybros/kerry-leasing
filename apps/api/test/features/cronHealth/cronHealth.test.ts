import { describe, it, expect } from 'vitest';
import {
  evaluateCronHealth,
  formatCronHealthAlert,
  type CronHealthCheck,
} from '../../../src/features/cronHealth/cronHealth.js';

const now = new Date('2026-07-07T12:00:00.000Z');
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);

describe('evaluateCronHealth', () => {
  it('never-run (null) is overdue with null age', () => {
    const [r] = evaluateCronHealth([{ label: 'x', lastSuccessAt: null, maxAgeHours: 26 }], now);
    expect(r.overdue).toBe(true);
    expect(r.ageHours).toBeNull();
  });

  it('within the window is healthy', () => {
    const [r] = evaluateCronHealth(
      [{ label: 'x', lastSuccessAt: hoursAgo(10), maxAgeHours: 26 }],
      now,
    );
    expect(r.overdue).toBe(false);
    expect(Math.round(r.ageHours!)).toBe(10);
  });

  it('past the window is overdue', () => {
    const [r] = evaluateCronHealth(
      [{ label: 'x', lastSuccessAt: hoursAgo(50), maxAgeHours: 26 }],
      now,
    );
    expect(r.overdue).toBe(true);
  });

  it('exactly at the boundary is not overdue (strictly greater)', () => {
    const [r] = evaluateCronHealth(
      [{ label: 'x', lastSuccessAt: hoursAgo(26), maxAgeHours: 26 }],
      now,
    );
    expect(r.overdue).toBe(false);
  });

  it('omitting `live` defaults to live=true (overdue behavior preserved)', () => {
    const [r] = evaluateCronHealth(
      [{ label: 'x', lastSuccessAt: hoursAgo(50), maxAgeHours: 26 }],
      now,
    );
    expect(r.status).toBe('overdue');
    expect(r.overdue).toBe(true);
  });
});

describe('evaluateCronHealth — idle / not-live gating', () => {
  it('a not-live job is idle and NEVER overdue — even when never run', () => {
    const [r] = evaluateCronHealth(
      [{ label: 'weekly', lastSuccessAt: null, maxAgeHours: 24 * 8, live: false }],
      now,
    );
    expect(r.status).toBe('idle');
    expect(r.overdue).toBe(false);
  });

  it('a not-live job is idle even when its last success is far past the window', () => {
    const [r] = evaluateCronHealth(
      [{ label: 'weekly', lastSuccessAt: hoursAgo(24 * 55), maxAgeHours: 24 * 8, live: false }],
      now,
    );
    expect(r.status).toBe('idle');
    expect(r.overdue).toBe(false);
  });

  it('once live, a fresh run is ok and a stale one is overdue again', () => {
    const [fresh] = evaluateCronHealth(
      [{ label: 'weekly', lastSuccessAt: hoursAgo(1), maxAgeHours: 24 * 8, live: true }],
      now,
    );
    expect(fresh.status).toBe('ok');
    const [stale] = evaluateCronHealth(
      [{ label: 'weekly', lastSuccessAt: hoursAgo(24 * 9), maxAgeHours: 24 * 8, live: true }],
      now,
    );
    expect(stale.status).toBe('overdue');
    expect(stale.overdue).toBe(true);
  });
});

describe('formatCronHealthAlert', () => {
  const checks: CronHealthCheck[] = [
    { label: 'Motive daily sync', lastSuccessAt: hoursAgo(10), maxAgeHours: 26 }, // healthy
    { label: 'Weekly driver SMS/email', lastSuccessAt: hoursAgo(24 * 51), maxAgeHours: 24 * 8 }, // overdue
    { label: 'EIA diesel price', lastSuccessAt: null, maxAgeHours: 48 }, // never run → overdue
  ];

  it('returns null when nothing is overdue', () => {
    const healthy = evaluateCronHealth([{ label: 'x', lastSuccessAt: hoursAgo(1), maxAgeHours: 26 }], now);
    expect(formatCronHealthAlert(healthy, now)).toBeNull();
  });

  it('summarizes overdue jobs (count in subject, each listed in body)', () => {
    const alert = formatCronHealthAlert(evaluateCronHealth(checks, now), now)!;
    expect(alert).not.toBeNull();
    expect(alert.subject).toContain('2 cron jobs overdue');
    expect(alert.text).toContain('Weekly driver SMS/email');
    expect(alert.text).toContain('NEVER RUN'); // the EIA null case
    expect(alert.text).toContain('Motive daily sync'); // healthy jobs still listed for context
  });

  it('does NOT alert when the only non-ok job is idle (not live)', () => {
    const results = evaluateCronHealth(
      [
        { label: 'Motive daily sync', lastSuccessAt: hoursAgo(10), maxAgeHours: 26 },
        // stale for 55 days, but not live yet → idle, must not alarm
        {
          label: 'Weekly driver SMS/email',
          lastSuccessAt: hoursAgo(24 * 55),
          maxAgeHours: 24 * 8,
          live: false,
          note: 'not live — no report delivered yet',
        },
      ],
      now,
    );
    expect(formatCronHealthAlert(results, now)).toBeNull();
  });

  it('lists an idle job (as "not live") for context when another job is overdue', () => {
    const results = evaluateCronHealth(
      [
        { label: 'EIA diesel price', lastSuccessAt: null, maxAgeHours: 48 }, // overdue
        {
          label: 'Weekly driver SMS/email',
          lastSuccessAt: null,
          maxAgeHours: 24 * 8,
          live: false,
          note: 'not live — no report delivered yet',
        },
      ],
      now,
    );
    const alert = formatCronHealthAlert(results, now)!;
    expect(alert.subject).toContain('1 cron job overdue');
    expect(alert.text).toContain('not live yet');
    expect(alert.text).toContain('not live — no report delivered yet');
  });
});
