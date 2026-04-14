# Known Limitations

Documented behavioral gaps with root cause and current handling.
Last updated: 2026-04-11

---

## 1. Motive Scorecard API — RESOLVED

**Endpoint:** `GET /v1/scorecard_summary` (previously incorrect: `/v1/vehicle_scorecard_summaries`)

**Root cause:** The sync code was calling the wrong endpoint path. The correct endpoint
is `/v1/scorecard_summary` per the Motive API docs. After fixing, all 7 recent dates
returned 200 OK with 0 records (no scorecard data yet for this date range, but no errors).

**Impact:** Now fully functional. Scorecard data will populate during backfill for any
dates where Motive has driver performance data available.

**Note:** This endpoint returns **driver** performance rollups (score, hard events, km),
not vehicle data. The schema was updated accordingly: `motive_scorecard_summaries`
now stores `driver_id`, `score`, `num_hard_accels`, `num_hard_brakes`, `num_hard_corners`,
`num_coached_events`, `total_kilometers`.

---

## 2. Samsara Driver Utilization — Not Implemented

**Endpoint:** Atlas (Samsara) does not use driver tracking. No Samsara-side driver
utilization endpoint has been configured.

**Symptom:** `getSamsaraDriverUtilization()` in `telematicsService.ts` returns an
empty array for all date ranges.

**Impact:** The driver tab in the fleet overview will show no data for Samsara orgs.

**Current handling:** Intentional stub with an empty return. A TODO comment marks
the location.

**Resolution path:** When a Samsara org with driver tracking is onboarded, implement
`syncSamsaraDriverUtilization` pointing to `GET /fleet/reports/drivers/fuel-energy`
and create the corresponding `samsara_driver_utilization` table + migration.

---

## 3. Motive Vehicle Utilization — Reconciliation Required for Some Vehicles

**Endpoint:** `GET /v2/vehicle_utilization`

**Symptom:** For some vehicles (confirmed: 2241, 2243), the v2 endpoint under-reports
`totalDistance` and `drivingTime` by 10–35% compared to dashboard values.

**Root cause:** Known Motive-side aggregation bug in the v2 endpoint for certain
vehicle configurations.

**Current handling:** `reconcileMotiveVehicleFromDrivingPeriods.ts` runs after each
`syncDrivingPeriods` call. It sums distance and duration from `motive_driving_periods`
(which is accurate) and patches `motive_vehicle_utilization` when the discrepancy
exceeds 10%. This correction runs in both directions (catches both under- and over-reporting).

**Resolution path:** No action needed. Reconciliation is automatic and self-correcting.
Monitor after each backfill run to confirm corrections are being applied.

---

## 4. Samsara 72-Hour Data Lag

**Endpoint:** All Samsara fuel-energy and safety endpoints

**Symptom:** Samsara data for a given calendar day is not finalized until up to 72
hours after that day ends.

**Current handling:** The daily sync runs a verify pass for the previous 3 days
(`yesterday`, `twoDaysAgo`, `threeDaysAgo`) on every cron execution, using upsert
to overwrite records as data finalizes.

**Impact:** Data for the last 1–3 days in the UI may be lower than final values.
This is expected and resolves automatically.

---

## 5. Motive Daily Cron — Not Confirmed on Render

**Status:** As of 2026-04-11, the Wolverine Motive org was manually backfilled from
`2026-03-01` to `2026-04-09`. The daily cron job `POST /cron/sync-motive` on Render
has not been verified as running.

**Action required:** Log in to Render, confirm the cron job exists and is scheduled
for 2–4 AM UTC. If missing, create it. The Atlas Samsara cron
(`POST /cron/sync-samsara`) is confirmed running.
