# Motive driving time vs our data (~22k minutes gap)

## What we use

- **Source:** Motive **v2 vehicle_utilization** API (`driving_time` in seconds).
- **Day boundary:** Eastern (America/Toronto) calendar day: midnight–midnight EST. We send `start_at`/`end_at` in UTC (e.g. `2026-01-15T05:00:00.000Z` → `2026-01-16T04:59:59.999Z` for Jan 15).
- **Storage:** One row per (org, vehicle, date). No double-counting; we upsert by `(clerkOrgId, vehicleId, date)`.
- **Aggregation:** Fleet report sums `drivingTime` (seconds) over all vehicle-days in the selected range and converts to minutes for display.

Example: January 2026 Wolverine ≈ **208,474 minutes** (1612 vehicle-days).

## Why Motive UI might show ~22k fewer minutes

1. **Different vehicle set**  
   Our total includes every vehicle that has utilization data for the org in the API. If the Motive report is filtered (e.g. by group, tag, or “active” vehicles), their count can be lower.

2. **Different date range or timezone**  
   We use strict Eastern calendar days. If the Motive report uses UTC or another timezone for “January,” the same trip can be assigned to different days and the monthly total can differ.

3. **Different metric or report**  
   Some Motive reports might show “drive time” (e.g. HOS-only) or a different definition than the utilization API’s “driving” time. Our comparison script (see below) showed that in our DB, driving periods have **no** PC/YM for January; vehicle utilization total is **lower** than the sum of driving-period durations, so the ~22k gap is **not** explained by us including PC/YM and Motive excluding it.

4. **Report scope**  
   Confirm in Motive that the report is for the **same org**, **Jan 1–31** (or same dates you’re using in our app), and the **same vehicle list** (no extra filters). Note the **exact report name** and **metric label** (e.g. “Drive time”, “Driving time”, “Vehicle utilization – driving”).

## Script: compare our two data sources

To compare vehicle utilization vs driving periods (by trip type) for the same org/period:

```bash
cd apps/api && pnpm exec tsx src/scripts/compare-driving-sources.ts
```

- **Vehicle utilization:** what we use for the fleet report (same as `jan-driving-minutes.ts`).
- **Driving periods:** per-trip data with `type` = `driving` | `PC` | `YM`. If Motive UI matched “drive time” to type=driving only, you’d expect their number to be close to “type=driving” from periods; in our January run, period totals were higher than vehicle utilization and PC/YM were 0, so the UI gap is likely due to scope/timezone/report definition rather than PC/YM.

## If you need a number that matches a specific Motive report

- Align **date range** and **timezone** with that report (we can add a configurable timezone for day boundaries if needed).
- If the report is filtered by vehicles/groups, we’d need to apply the same filter (e.g. by Motive group or tag) when querying our data.
- If the report is “drive time” (HOS) and Motive ever starts returning utilization broken down by trip type, we could expose “driving only” (exclude PC/YM); today we only have aggregate `driving_time` from vehicle_utilization.
