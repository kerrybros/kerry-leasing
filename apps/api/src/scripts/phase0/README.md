# Phase 0 — Telematics Validation Scripts

Read-only scripts that run against production data to confirm API accuracy,
unit consistency, and boundary logic **before** any sync build work begins.

## Running a script

```bash
# From apps/api/
pnpm exec tsx src/scripts/phase0/<script-name>.ts
```

By default each script auto-detects the first active org for the relevant provider.
Override with an env var:

```bash
ORG_ID=org_xxx pnpm exec tsx src/scripts/phase0/<script-name>.ts
```

## Scripts

### Motive

| Script | What it validates |
|---|---|
| `validate-motive-v2-boundary.ts` | Compares v1 vs v2 vehicle utilization for the same date — confirms the UTC boundary fix gives consistent driving_fuel + distance vs the Motive dashboard |
| `validate-motive-driver-util-units.ts` | Confirms whether `driving_time` in `/v2/driver_utilization` is in **seconds** or **minutes**, and whether imperial fuel (gallons) is respected |
| `validate-motive-idle-events.ts` | Tests whether `/v1/idle_events` works without `driver_ids`/`vehicle_ids` filter; confirms fuel units (gallons) per event and cross-checks totals against vehicle utilization idle_fuel for the same date |
| `validate-motive-scorecard-timezone.ts` | Confirms scorecard rollup totals against summed vehicle utilization for the same 7-day window; flags if boundary bleed inflates or deflates day counts |

### Samsara

| Script | What it validates |
|---|---|
| `validate-samsara-vehicle-fuel-energy.ts` | Pulls `/fleet/reports/vehicles/fuel-energy` for a 7-day settled window, exhausts pagination, confirms fuel in mL + distance in meters + idle ms; cross-checks against `samsara_raw_data` table |
| `validate-samsara-idling-events.ts` | Sums `/idling/events` fuel per vehicle per day; compares idle fuel sum to `engineIdleTimeDurationMs` from fuel-energy report; prints consistency delta |
| `validate-samsara-vehicle-stats.ts` | Snapshots `/fleet/vehicles/stats` for OBD + GPS fields: odometer, engine hours, oil life %, fuel %; no DB comparison, just confirms fields are present |
| `validate-samsara-vehicle-roster.ts` | Pulls `/fleet/vehicles`; cross-references against `telematics_vehicle_maps`; flags missing VINs, mismatched names, and vehicles present in DB but not in API |

## Pass / Fail criteria

Each script prints a summary block like:

```
═══════════════════════════════════════
RESULT: PASS (3 checks)
───────────────────────────────────────
✓  [motive-v2-boundary] driving_fuel delta < 2% for all vehicles
✓  [motive-v2-boundary] driving_time delta < 2% for all vehicles
✓  [motive-v2-boundary] v2 response covers full 24 h window
═══════════════════════════════════════
```

A **WARN** means the data looks usable but needs review.
A **FAIL** means something is wrong and the corresponding sync build should be blocked until resolved.
