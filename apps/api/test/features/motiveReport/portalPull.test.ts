import { describe, it, expect } from 'vitest';
import {
  planPullWindows,
  driversBelowActivityFloor,
  parseLoginForm,
  MIN_ACTIVITY_SECONDS,
} from '../../../src/features/motiveReport/portalPull.js';

describe('planPullWindows', () => {
  it('covers 14 daily windows, 6 completed Mon..Sun weeks, MTD and prior month, all ending by yesterday', () => {
    // Friday 2026-09-18 ET
    const w = planPullWindows('2026-09-18');
    const dailies = w.filter((x) => x.windowStart === x.windowEnd).map((x) => x.windowStart);
    expect(dailies).toHaveLength(14);
    expect(dailies[0]).toBe('2026-09-17');
    expect(dailies[13]).toBe('2026-09-04');
    // Six weeks, not four: the weekly driver card shows a four week trend, so
    // the plan has to stay ahead of it with room to spare. Four would leave the
    // oldest week uncovered the moment a week rolls over.
    const weeks = w.filter((x) => x.windowStart !== x.windowEnd && !x.windowStart.endsWith('-01'));
    expect(weeks).toEqual([
      { windowStart: '2026-09-07', windowEnd: '2026-09-13' },
      { windowStart: '2026-08-31', windowEnd: '2026-09-06' },
      { windowStart: '2026-08-24', windowEnd: '2026-08-30' },
      { windowStart: '2026-08-17', windowEnd: '2026-08-23' },
      { windowStart: '2026-08-10', windowEnd: '2026-08-16' },
      { windowStart: '2026-08-03', windowEnd: '2026-08-09' },
    ]);
    expect(weeks.length).toBeGreaterThan(4);
    expect(w).toContainEqual({ windowStart: '2026-09-01', windowEnd: '2026-09-17' }); // MTD
    expect(w).toContainEqual({ windowStart: '2026-08-01', windowEnd: '2026-08-31' }); // prior month
    expect(w.every((x) => x.windowEnd <= '2026-09-17')).toBe(true);
  });

  it('on a Monday, the newest completed week ends yesterday (Sunday)', () => {
    const weeks = planPullWindows('2026-09-21').filter((x) => x.windowStart !== x.windowEnd && !x.windowStart.endsWith('-01'));
    expect(weeks[0]).toEqual({ windowStart: '2026-09-14', windowEnd: '2026-09-20' });
  });

  it('on the 1st there is no month-to-date window, only the prior month', () => {
    const w = planPullWindows('2026-10-01');
    expect(w.filter((x) => x.windowStart === '2026-10-01')).toHaveLength(0);
    expect(w).toContainEqual({ windowStart: '2026-09-01', windowEnd: '2026-09-30' });
  });
});

describe('driversBelowActivityFloor', () => {
  const row = (driverId: number, first: string, last: string, drivingTime: number, idleTime: number) => ({
    driverId, driverFirstName: first, driverLastName: last, drivingTime, idleTime,
  });

  it('flags a genuinely working driver the report left out', () => {
    const r = driversBelowActivityFloor(
      [row(1, 'Tre', 'Jeknavorian', 9000, 600), row(2, 'Jose', 'Duque', 7000, 400)],
      new Set(['jose duque'])
    );
    expect(r.active).toBe(2);
    expect(r.missing).toEqual(['tre jeknavorian']);
  });

  it('ignores a driver whose whole window is under the two-minute floor', () => {
    // The two real cases that blocked the 90 day backfill: 105s and 106s, both
    // absent from Motive's own report because it has its own floor.
    const r = driversBelowActivityFloor(
      [row(1, 'Tre', 'Jeknavorian', 0, 105), row(2, 'Jose', 'Duque', 106, 0)],
      new Set()
    );
    expect(r.active).toBe(0);
    expect(r.missing).toEqual([]);
  });

  it('treats the floor as inclusive, and anything under it as not working', () => {
    const at = driversBelowActivityFloor([row(1, 'A', 'B', MIN_ACTIVITY_SECONDS, 0)], new Set());
    expect(at.missing).toEqual(['a b']);
    const under = driversBelowActivityFloor([row(1, 'A', 'B', MIN_ACTIVITY_SECONDS - 1, 0)], new Set());
    expect(under.missing).toEqual([]);
  });

  it('sums a driver across the whole window, not one arbitrary day', () => {
    // Four days of 40s each clears the floor together though no single day does.
    const r = driversBelowActivityFloor(
      [row(1, 'A', 'B', 40, 0), row(1, 'A', 'B', 40, 0), row(1, 'A', 'B', 40, 0), row(1, 'A', 'B', 40, 0)],
      new Set()
    );
    expect(r.active).toBe(1);
    expect(r.missing).toEqual(['a b']);
  });

  it('counts driving and idle together toward the floor', () => {
    const r = driversBelowActivityFloor([row(1, 'A', 'B', 70, 70)], new Set());
    expect(r.missing).toEqual(['a b']);
  });

  it('skips rows with no driver attached and normalises doubled spaces', () => {
    const r = driversBelowActivityFloor(
      [row(null as any, 'X', 'Y', 9999, 0), row(3, 'Chris ', ' Gross', 9999, 0)],
      new Set()
    );
    expect(r.active).toBe(1);
    expect(r.missing).toEqual(['chris gross']);
  });
});

describe('parseLoginForm', () => {
  // The real form served by auth.gomotive.com on 2026-09-30, trimmed. Motive
  // moved sign-in behind OAuth that day and renamed user[...] to
  // user_profile[...], which is what broke the nightly pull.
  const CURRENT = `
    <form id="sign-in-page-form" action="/login" accept-charset="UTF-8" method="post">
      <input type="hidden" name="authenticity_token" value="D5rp-W5wyqihniW" autocomplete="off" />
      <input required="required" class="form-control" type="text" value="" name="user_profile[email]" />
      <input type="password" required="required" name="user_profile[password]" />
      <input name="client_id" value="8OlxtHqCxDMvMN7I" autocomplete="off" type="hidden" />
      <input name="client_secret" autocomplete="off" type="hidden" />
      <input name="return_url" value="https://auth.gomotive.com/oauth/authorize?response_type=code&amp;client_id=8OlxtHqCxDMvMN7I&amp;scope=openid" type="hidden" />
      <input name="ref" value="sign-up" autocomplete="off" type="hidden" />
      <input type="submit" name="commit" value="Sign in" />
    </form>`;

  it('reads the current OAuth form, including its renamed fields', () => {
    const f = parseLoginForm(CURRENT)!;
    expect(f.action).toBe('/login');
    expect(f.emailField).toBe('user_profile[email]');
    expect(f.passwordField).toBe('user_profile[password]');
  });

  it('carries every hidden field through untouched so CSRF and OAuth survive', () => {
    const f = parseLoginForm(CURRENT)!;
    expect(f.fields.authenticity_token).toBe('D5rp-W5wyqihniW');
    expect(f.fields.client_id).toBe('8OlxtHqCxDMvMN7I');
    expect(f.fields.ref).toBe('sign-up');
    expect(f.fields.client_secret).toBe('');
  });

  it('decodes entities in a hidden value, so the OAuth return_url stays valid', () => {
    const f = parseLoginForm(CURRENT)!;
    expect(f.fields.return_url).toContain('response_type=code&client_id=');
    expect(f.fields.return_url).not.toContain('&amp;');
  });

  it('leaves the credential fields out of the carried-through set', () => {
    const f = parseLoginForm(CURRENT)!;
    expect(f.fields).not.toHaveProperty('user_profile[email]');
    expect(f.fields).not.toHaveProperty('user_profile[password]');
  });

  it('drops the submit button, which is not ours to send back', () => {
    expect(parseLoginForm(CURRENT)!.fields).not.toHaveProperty('commit');
  });

  it('still reads the old pre-OAuth form, so the change is not a one-way door', () => {
    const legacy = `
      <form action="/log-in" method="post">
        <input type="hidden" name="authenticity_token" value="abc" />
        <input type="text" name="user[email]" value="" />
        <input type="password" name="user[password]" />
        <input type="hidden" name="return_url" value="https://app.gomotive.com/" />
      </form>`;
    const f = parseLoginForm(legacy)!;
    expect(f.emailField).toBe('user[email]');
    expect(f.passwordField).toBe('user[password]');
    expect(f.fields.authenticity_token).toBe('abc');
  });

  it('picks the sign-in form out of a page that also has a search box', () => {
    const page = `
      <form action="/search"><input type="text" name="q" /></form>
      <form action="/login"><input type="text" name="email" /><input type="password" name="password" /></form>`;
    expect(parseLoginForm(page)!.action).toBe('/login');
  });

  it('returns null when no password field exists, so the caller can fail loudly', () => {
    expect(parseLoginForm('<form action="/x"><input type="text" name="email" /></form>')).toBeNull();
    expect(parseLoginForm('<html><body>JavaScript challenge</body></html>')).toBeNull();
  });
});
