import { describe, it, expect } from 'vitest';
import { normalizePhone } from '../../../src/features/drivers/phone.js';
import { fillMissingPhonesFromMotive } from '../../../src/features/drivers/motivePhoneFallback.js';

describe('normalizePhone', () => {
  it("accepts Motive's bare 10-digit US numbers and the shapes people type", () => {
    expect(normalizePhone('3132837360')).toBe('+13132837360');
    expect(normalizePhone('(313) 283-7360')).toBe('+13132837360');
    expect(normalizePhone('313-283-7360')).toBe('+13132837360');
    expect(normalizePhone('+1 313 283 7360')).toBe('+13132837360');
  });
  it('rejects anything that is not a valid number', () => {
    for (const bad of [null, undefined, '', '   ', '12345', 'not a phone', '000']) {
      expect(normalizePhone(bad)).toBeNull();
    }
  });
});

/** Minimal stand-in for the two Prisma models this helper reads. */
function fakePrisma(contacts: any[], masters: any[], writes: any[] = []) {
  return {
    driverContact: {
      findMany: async ({ where, select }: any) => {
        const missing = Array.isArray(where.OR);
        return contacts
          .filter((c) => (missing ? !c.phoneE164 : !!c.phoneE164))
          .map((c) => Object.fromEntries(Object.keys(select).map((k) => [k, c[k]])));
      },
      update: async ({ where, data }: any) => {
        writes.push({ id: where.id, ...data });
        const c = contacts.find((x) => x.id === where.id);
        if (c) c.phoneE164 = data.phoneE164;
        return { id: where.id };
      },
    },
    motiveDriverMaster: { findMany: async () => masters },
  } as any;
}

describe('fillMissingPhonesFromMotive', () => {
  const masters = [
    { motiveDriverId: 1, phone: '3132837360', status: 'active' },
    { motiveDriverId: 2, phone: null, status: 'active' },
    { motiveDriverId: 3, phone: '3132837361', status: 'active' },
    { motiveDriverId: 4, phone: '123', status: 'active' },
  ];

  it('fills only empty numbers and never touches one already set', async () => {
    const writes: any[] = [];
    const contacts = [
      { id: 'a', displayName: 'Empty One', motiveDriverId: 1, phoneE164: null },
      { id: 'b', displayName: 'Already Has One', motiveDriverId: 3, phoneE164: '+15550001111' },
    ];
    const r = await fillMissingPhonesFromMotive(fakePrisma(contacts, masters, writes), 'org', { apply: true });
    expect(r.filled.map((f) => f.displayName)).toEqual(['Empty One']);
    expect(writes).toEqual([{ id: 'a', phoneE164: '+13132837360' }]);
  });

  it('writes nothing when apply is false', async () => {
    const writes: any[] = [];
    const contacts = [{ id: 'a', displayName: 'Empty One', motiveDriverId: 1, phoneE164: null }];
    const r = await fillMissingPhonesFromMotive(fakePrisma(contacts, masters, writes), 'org', { apply: false });
    expect(r.filled).toHaveLength(1);
    expect(writes).toHaveLength(0);
  });

  it('explains every driver it could not fill', async () => {
    const contacts = [
      { id: 'a', displayName: 'No Motive Link', motiveDriverId: null, phoneE164: null },
      { id: 'b', displayName: 'Motive Has None', motiveDriverId: 2, phoneE164: null },
      { id: 'c', displayName: 'Bad Number', motiveDriverId: 4, phoneE164: null },
    ];
    const r = await fillMissingPhonesFromMotive(fakePrisma(contacts, masters), 'org', { apply: false });
    expect(r.filled).toHaveLength(0);
    expect(r.stillMissing.map((m) => m.displayName)).toEqual(['No Motive Link', 'Motive Has None', 'Bad Number']);
    expect(r.stillMissing[0].reason).toMatch(/not linked/);
    expect(r.stillMissing[1].reason).toMatch(/no phone/);
    expect(r.stillMissing[2].reason).toMatch(/not a valid/);
  });

  it('refuses a number already used by another contact in the org', async () => {
    const contacts = [
      { id: 'a', displayName: 'Wants It', motiveDriverId: 1, phoneE164: null },
      { id: 'b', displayName: 'Has It', motiveDriverId: 9, phoneE164: '+13132837360' },
    ];
    const r = await fillMissingPhonesFromMotive(fakePrisma(contacts, masters), 'org', { apply: false });
    expect(r.filled).toHaveLength(0);
    expect(r.stillMissing[0].reason).toMatch(/already on another contact/);
  });

  it('does not hand the same Motive number to two contacts in one pass', async () => {
    const dupes = [
      { motiveDriverId: 1, phone: '3132837360', status: 'active' },
      { motiveDriverId: 5, phone: '313-283-7360', status: 'active' },
    ];
    const contacts = [
      { id: 'a', displayName: 'First', motiveDriverId: 1, phoneE164: null },
      { id: 'b', displayName: 'Second', motiveDriverId: 5, phoneE164: null },
    ];
    const r = await fillMissingPhonesFromMotive(fakePrisma(contacts, dupes), 'org', { apply: false });
    expect(r.filled.map((f) => f.displayName)).toEqual(['First']);
    expect(r.stillMissing[0].reason).toMatch(/already on another contact/);
  });
});
