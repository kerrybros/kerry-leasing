import { describe, it, expect } from 'vitest';
import { assetNameByAssetId, defectRefFromRaw } from '../../../src/integrations/whiparound/fields.js';

describe('defectRefFromRaw', () => {
  it('reads the v4 ui_number', () => {
    expect(defectRefFromRaw({ ui_number: 'FA-0311', reference: null })).toBe('FA-0311');
  });

  it('falls back to reference when ui_number is missing or blank', () => {
    expect(defectRefFromRaw({ reference: 'FA-0162' })).toBe('FA-0162');
    expect(defectRefFromRaw({ ui_number: '  ', reference: 'FA-0162' })).toBe('FA-0162');
  });

  it('is null when neither is present', () => {
    expect(defectRefFromRaw({})).toBeNull();
  });
});

describe('assetNameByAssetId', () => {
  it('maps each asset to the first (newest) non-empty name', () => {
    const map = assetNameByAssetId([
      { assetId: 7, assetName: '2201' },
      { assetId: 7, assetName: 'old name' },
      { assetId: 8, assetName: '   ' },
      { assetId: 8, assetName: '3105' },
      { assetId: null, assetName: 'orphan' },
    ]);
    expect(map.get(7)).toBe('2201');
    expect(map.get(8)).toBe('3105');
    expect(map.size).toBe(2);
  });
});
