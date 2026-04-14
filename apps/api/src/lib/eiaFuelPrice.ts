/**
 * EIA DIESEL FUEL PRICE
 * Fetches the latest retail diesel price for the Midwest (PADD 2) region from the EIA API.
 * All customer orgs operate in Michigan, which falls under EIA PADD 2 (Midwest).
 * Caches the value in the system_config table with key "diesel_price_per_gallon".
 *
 * Requires: EIA_API_KEY env var (free key from https://www.eia.gov/opendata/)
 *
 * EIA series used: EMD_EPD2D_PTE_R20_DPG (Midwest/PADD 2 Retail Diesel Prices)
 * Released weekly, typically Mondays. Call this from the cron sync to auto-update weekly.
 */

import { getAppPrisma } from './prisma.js';

const EIA_API_URL = 'https://api.eia.gov/v2/petroleum/pri/gnd/data/';
const SERIES_ID = 'EMD_EPD2D_PTE_R20_DPG'; // PADD 2 Midwest (covers Michigan)
const CONFIG_KEY = 'diesel_price_per_gallon';
const FALLBACK_PRICE = 3.85; // last-known reasonable fallback if EIA call fails

export interface DieselPriceResult {
  pricePerGallon: number;
  source: 'eia' | 'db_cache' | 'fallback';
  asOf?: string; // YYYY-MM-DD
}

/**
 * Fetch the latest diesel price from EIA and persist it in system_config.
 * Returns the price per gallon (USD).
 */
export async function refreshDieselPrice(): Promise<DieselPriceResult> {
  const apiKey = process.env.EIA_API_KEY;
  if (!apiKey) {
    console.warn('[EIA] EIA_API_KEY not set — using cached or fallback price');
    return getCachedOrFallbackPrice();
  }

  try {
    const url = new URL(EIA_API_URL);
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('frequency', 'weekly');
    url.searchParams.set('data[0]', 'value');
    url.searchParams.set('facets[series][]', SERIES_ID);
    url.searchParams.set('sort[0][column]', 'period');
    url.searchParams.set('sort[0][direction]', 'desc');
    url.searchParams.set('length', '1');
    url.searchParams.set('offset', '0');

    const res = await fetch(url.toString());
    if (!res.ok) {
      throw new Error(`EIA API returned ${res.status}: ${await res.text()}`);
    }

    const json = (await res.json()) as {
      response?: { data?: Array<{ period: string; value: string }> };
    };

    const latest = json.response?.data?.[0];
    if (!latest?.value) {
      throw new Error('EIA API returned no data rows');
    }

    const price = parseFloat(latest.value);
    if (isNaN(price) || price <= 0) {
      throw new Error(`EIA returned invalid price: ${latest.value}`);
    }

    // Persist to DB
    const appPrisma = getAppPrisma();
    await appPrisma.systemConfig.upsert({
      where: { key: CONFIG_KEY },
      create: { key: CONFIG_KEY, value: String(price) },
      update: { value: String(price) },
    });

    console.log(`[EIA] Diesel price updated: $${price}/gal (period: ${latest.period})`);
    return { pricePerGallon: price, source: 'eia', asOf: latest.period };
  } catch (err: any) {
    console.error('[EIA] Failed to fetch diesel price:', err.message);
    return getCachedOrFallbackPrice();
  }
}

/**
 * Get the current diesel price per gallon.
 * Uses DB cache if present; otherwise triggers a live EIA fetch and caches the result.
 * Falls back to hardcoded default only if both DB and EIA are unavailable.
 */
export async function getDieselPricePerGallon(): Promise<number> {
  // Check DB cache first
  try {
    const appPrisma = getAppPrisma();
    const row = await appPrisma.systemConfig.findUnique({ where: { key: CONFIG_KEY } });
    if (row) {
      const price = parseFloat(row.value);
      if (!isNaN(price) && price > 0) {
        return price;
      }
    }
  } catch {
    // DB unavailable — fall through to live fetch
  }

  // Cache is empty or unreadable — attempt a live EIA fetch now
  const result = await refreshDieselPrice();
  return result.pricePerGallon;
}

async function getCachedOrFallbackPrice(): Promise<DieselPriceResult> {
  try {
    const appPrisma = getAppPrisma();
    const row = await appPrisma.systemConfig.findUnique({ where: { key: CONFIG_KEY } });
    if (row) {
      const price = parseFloat(row.value);
      if (!isNaN(price) && price > 0) {
        return { pricePerGallon: price, source: 'db_cache' };
      }
    }
  } catch {
    // DB unavailable — use fallback
  }
  return { pricePerGallon: FALLBACK_PRICE, source: 'fallback' };
}
