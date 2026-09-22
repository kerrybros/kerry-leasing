import { describe, it, expect } from 'vitest';
import {
  windowFromSubject,
  windowFromFilename,
  classifyWindow,
  addDays,
} from '../../../src/features/motiveReport/reportWindow.js';

const RECEIVED = new Date('2026-09-15T04:10:42Z'); // 12:10 AM ET on Sep 15

describe('windowFromSubject', () => {
  it('trims the delivery day off a "Last 24 Hours" label, leaving the single day before', () => {
    const w = windowFromSubject(
      'Your Driver Fuel Performance - L1D Report for Sep 14 - Sep 15 is ready',
      RECEIVED
    );
    expect(w).toMatchObject({
      windowStart: '2026-09-14', windowEnd: '2026-09-14', granularity: 'DAY',
      labelStart: '2026-09-14', labelEnd: '2026-09-15', trimmedDeliveryDate: true,
    });
  });

  it('uses the EASTERN delivery day: 11 PM ET Sep 18 is 03:00Z Sep 19', () => {
    const w = windowFromSubject('Report for Sep 17 - Sep 18 is ready', new Date('2026-09-19T03:00:00Z'));
    expect(w).toMatchObject({ windowStart: '2026-09-17', windowEnd: '2026-09-17', trimmedDeliveryDate: true });
  });

  it('trims a "Last 7 Days" label to the six completed days', () => {
    // Fired Sunday 2026-09-20 at 11 PM ET: label Mon..Sun, effective Mon..Sat.
    const w = windowFromSubject('Report for Sep 14 - Sep 20 is ready', new Date('2026-09-21T03:00:00Z'));
    expect(w).toMatchObject({ windowStart: '2026-09-14', windowEnd: '2026-09-19', granularity: 'CUSTOM', trimmedDeliveryDate: true });
  });

  it('leaves a label that ends before the delivery day untrimmed and reports it', () => {
    const w = windowFromSubject('Report for Sep 7 - Sep 13 is ready', RECEIVED);
    expect(w).toMatchObject({ windowStart: '2026-09-07', windowEnd: '2026-09-13', granularity: 'WEEK', trimmedDeliveryDate: false });
  });

  it('infers the prior year across a New Year boundary', () => {
    const w = windowFromSubject('Report for Dec 31 - Jan 1 is ready', new Date('2027-01-01T05:05:00Z'));
    expect(w).toMatchObject({ windowStart: '2026-12-31', windowEnd: '2026-12-31', granularity: 'DAY', trimmedDeliveryDate: true });
  });

  it('accepts explicit years', () => {
    const w = windowFromSubject('Report for Jul 1, 2026 - Jul 31, 2026 is ready', RECEIVED);
    expect(w).toMatchObject({ windowStart: '2026-07-01', windowEnd: '2026-07-31', granularity: 'MONTH' });
  });

  it('returns null when the label is only the delivery day (nothing left after trim)', () => {
    expect(windowFromSubject('Report for Sep 15 is ready', RECEIVED)).toBeNull();
  });

  it('returns null when no date range is present', () => {
    expect(windowFromSubject('Wolverine Administrator invited you to join', RECEIVED)).toBeNull();
  });
});

describe('windowFromFilename', () => {
  it('reads the window from the manual-export naming convention', () => {
    expect(windowFromFilename('tmp/motive-report/wolverine_2026-06-29_2026-07-05.csv')).toEqual({
      windowStart: '2026-06-29', windowEnd: '2026-07-05', granularity: 'WEEK',
    });
    expect(windowFromFilename('wolverine_2026-08-01_2026-08-31.csv')?.granularity).toBe('MONTH');
    expect(windowFromFilename('wolverine_2026-08-03_2026-08-16.csv')?.granularity).toBe('CUSTOM');
  });
  it('rejects unnamed or reversed files', () => {
    expect(windowFromFilename('driver_fuel_performance.csv')).toBeNull();
    expect(windowFromFilename('x_2026-08-31_2026-08-01.csv')).toBeNull();
  });
});

describe('classifyWindow / addDays', () => {
  it('classifies day, Monday-week, month, custom', () => {
    expect(classifyWindow('2026-09-14', '2026-09-14')).toBe('DAY');
    expect(classifyWindow('2026-09-07', '2026-09-13')).toBe('WEEK');
    expect(classifyWindow('2026-09-08', '2026-09-14')).toBe('CUSTOM'); // Tue-Mon
    expect(classifyWindow('2026-02-01', '2026-02-28')).toBe('MONTH');
    expect(classifyWindow('2026-02-01', '2026-02-27')).toBe('CUSTOM');
  });
  it('addDays crosses month ends', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});
