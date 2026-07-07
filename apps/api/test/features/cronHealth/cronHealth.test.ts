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
});
