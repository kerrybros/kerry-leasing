/**
 * Small, pure field mappers for Whip Around data, kept apart from the sync and
 * route code so they can be unit tested.
 */

function nonEmpty(val: unknown): string | null {
  if (typeof val !== 'string' && typeof val !== 'number') return null;
  const s = String(val).trim();
  return s.length ? s : null;
}

/**
 * The FA-0311 style defect number. The v4 API returns it as `ui_number`;
 * `reference` is the older name, kept as a fallback.
 */
export function defectRefFromRaw(raw: { ui_number?: unknown; reference?: unknown }): string | null {
  return nonEmpty(raw.ui_number) ?? nonEmpty(raw.reference);
}

/**
 * Inspections only carry `asset_id`; defects carry both `asset_id` and
 * `asset_name`. Builds asset_id to asset_name from defect rows. Pass rows
 * newest first: the first non-empty name seen for an asset wins, so a renamed
 * asset shows its current name.
 */
export function assetNameByAssetId(
  rows: Array<{ assetId: number | null; assetName: string | null }>,
): Map<number, string> {
  const map = new Map<number, string>();
  for (const r of rows) {
    if (r.assetId == null || map.has(r.assetId)) continue;
    const name = nonEmpty(r.assetName);
    if (name) map.set(r.assetId, name);
  }
  return map;
}
