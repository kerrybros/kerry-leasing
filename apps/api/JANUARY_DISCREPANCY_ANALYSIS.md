# January 2026 Driving Time Discrepancy – Analysis Summary

## What we compared

- **Our number:** 208,474 minutes (from `motive_vehicle_utilization` for Jan 1–31, Eastern day, org Wolverine).
- **Motive UI (Vehicle Utilization Report):** ~22,000 minutes **less** than us (so ~186k).
- **Goal:** Find where the discrepancy comes from (month and all units as a whole).

## Findings (run `pnpm exec tsx src/scripts/analyze-january-discrepancy.ts` to reproduce)

### 1. No double-counting

- **1,612 rows** in January = 52 vehicles × 31 days. Unique `(vehicleId, date)` = 1,612.
- **Duplicates: 0.** So the gap is **not** from counting the same vehicle-day twice.

### 2. Units are correct

- We store **seconds** from the API and display **minutes** (÷ 60). Total 12,508,440 sec → 208,474 min. No unit mix-up.

### 3. Per-day distribution is normal

- All 31 days present. Min day ~835 min, max ~10,530 min, mean ~6,725 min. No single day is an obvious spike that would explain +22k.

### 4. Vehicle utilization vs driving periods (both from Motive)

- **Vehicle utilization (what we show):** 208,474 min.
- **Driving periods (trip-level, all types):** 245,343 min.
- So **utilization is ~36,869 min lower** than the sum of driving periods. On 27 of 31 days, periods total is higher than utilization for that day.

**Implication:** Our stored value is already the **lower** of the two Motive data sources we have. The discrepancy vs Motive UI is **not** from us inflating the number; if anything, the API utilization rollup is the conservative one.

### 5. Vehicle set

- We have **52 vehicles** with at least one utilization row in January; **43** have driving > 0, **9** have 0 driving all month (109, 110, 114, 221, 2165, 2182, 2253, 2261, 2262). Zero-driving units add 0 to the total.

## Where the discrepancy is coming from

Given the above:

1. **Not from our pipeline:** No duplicates, correct units, normal daily distribution, and we use the lower of the two internal Motive sources (utilization, not periods).

2. **Likely causes of “Motive UI ~22k lower”:**
   - **Different vehicle set:** If the Motive report filters vehicles (e.g. by group, tag, or “in report” list), they sum fewer vehicle-days → lower total. We sum all vehicles returned by the API for the org.
   - **Different metric:** The UI report might not be the same as the **Vehicle Utilization** API (e.g. “Drive time” or HOS-only vs “driving time” in the API). We use exactly what the v2 vehicle_utilization API returns.
   - **Different date/time handling:** We use Eastern midnight–midnight for each day. If the report uses another timezone or different month boundaries, daily buckets differ and the January total can be lower (or higher) than ours.

## Recommendation

- Treat our **208,474 min** as the correct total for **Vehicle Utilization API, Eastern calendar, all vehicles in the org**.
- To align with a specific Motive UI report: export that report to CSV and run the unit-by-unit comparison script; then either match their vehicle set / date range in our logic or document that we use the API definition and they may use a different one.
