# Telematics Architecture

Provider-agnostic telematics pipeline. Any telematics provider can be integrated by following the pattern in this document. The frontend and API routes never know which provider they are talking to.

---

## Folder Structure

```
apps/api/src/telematics/
│
├── interfaces/
│   └── index.ts              ← Normalized types + ITelematicsProvider contract
│
├── registry/
│   └── providerRegistry.ts   ← Maps provider name → sync functions (add new providers here)
│
├── providers/
│   ├── index.ts              ← Credential validation utilities
│   └── ...
│
├── motive/
│   ├── client.ts             ← Authenticated HTTP client
│   ├── syncService.ts        ← Org queue orchestrator (daily sync entry point)
│   ├── backdate.ts           ← Historical backfill script
│   ├── types.ts              ← Motive API response types
│   ├── endpoints/            ← Raw API call functions (one file per endpoint)
│   │   ├── vehicleUtilization.ts
│   │   ├── driverUtilization.ts
│   │   ├── idleEvents.ts
│   │   ├── drivingPeriods.ts
│   │   └── geofences.ts
│   └── sync/                 ← DB write modules (one file per data type)
│       ├── syncVehicleUtilization.ts
│       ├── syncDriverUtilization.ts
│       ├── syncIdleEvents.ts
│       ├── syncDrivingPeriods.ts
│       └── syncGeofences.ts
│
├── samsara/
│   ├── client.ts
│   ├── syncService.ts
│   ├── backdate.ts
│   ├── types.ts
│   ├── idleAggregates.ts
│   ├── endpoints/
│   │   ├── fuelEnergyReports.ts
│   │   └── idlingEvents.ts
│   └── sync/
│       └── syncFuelEnergyReports.ts
│
├── dates.ts                  ← Shared date/UTC boundary helpers
└── types.ts                  ← TelematicsProvider enum, credentials types
```

---

## Data Flow

**Motive Pipeline:**
```
Cron (2-4 AM UTC)  POST /cron/sync-motive
  └─► motive/syncService.ts: syncMotiveDaily()
        └─► for each active org (sequential):
              syncMotiveOrgForDate(orgId, apiKey, date)
                ├─► syncVehicleUtilization        ─► motive_vehicle_utilization
                │     └─► [after] reconcileMotiveVehicleFromDrivingPeriods
                │           (patches v2 under-reporting from driving_periods data)
                ├─► syncDriverUtilization         ─► motive_driver_utilization
                ├─► syncIdleEvents                ─► motive_idle_events
                ├─► syncDrivingPeriods            ─► motive_driving_periods
                ├─► syncGeofences                 ─► motive_geofences (weekly gate)
                └─► syncMotiveScorecard           ─► motive_scorecard_summaries
                      (graceful failure if endpoint unavailable — see KNOWN_LIMITATIONS.md)
```

**Samsara Pipeline:**
```
Cron (2-4 AM UTC)  POST /cron/sync-samsara
  └─► samsara/syncService.ts: syncSamsaraDaily()
        └─► for each active org (sequential):
              syncSamsaraOrgForDate(orgId, apiToken, date)
                ├─► syncSamsaraVehicles           ─► telematics_vehicle_maps (7-day gate)
                ├─► syncFuelEnergyReports         ─► samsara_vehicle_utilization
                │     └─► also writes idle_fuel via samsara_idling_events join
                ├─► syncSamsaraVehicleStats       ─► samsara_vehicle_stats_snapshots
                ├─► syncSamsaraSafetyEvents       ─► samsara_safety_events
                └─► syncSamsaraIdlingEvents       ─► samsara_idling_events

Verify passes:
  Motive:  yesterday + twoDaysAgo (48h data lag)
  Samsara: yesterday + twoDaysAgo + threeDaysAgo (72h data lag)
```

**Read path (both providers):**
```
API Request (GET /telematics/normalized/vehicle-utilization)
  └─► telematicsNormalized.ts route
        └─► TelematicsService.getVehicleUtilization(orgId, from, to)
              └─► resolveProvider(orgId) → 'MOTIVE' | 'SAMSARA'
                    └─► getMotiveVehicleUtilization() | getSamsaraVehicleUtilization()
                          └─► SELECT from provider table
                                └─► convert DB minutes → seconds
                                      └─► NormalizedVehicleRecord[]  ─► JSON
```

---

## Unit Standards

All normalized types use these units. Conversions happen at two points:
- **Write time** (in sync modules): raw API values → DB storage units
- **Read time** (in `telematicsService.ts`): DB units → normalized API contract units

| Dimension | DB Storage | Normalized API Contract (served to frontend) |
|-----------|-----------|----------------------------------------------|
| Time      | minutes   | **seconds** (DB value × 60) |
| Distance  | miles     | miles |
| Fuel      | gallons   | gallons |
| Dates     | `YYYY-MM-DD` string | `YYYY-MM-DD` string |
| Timestamps | ISO 8601 / RFC 3339 | ISO 8601 / RFC 3339 |

> The frontend aggregation layer (`useFleetAggregations`) expects time in seconds.
> The DB stores in minutes because Motive's API returns seconds (÷60 on write)
> and Samsara returns milliseconds (÷60000 on write). The service layer multiplies
> back by 60 before returning.

---

## The Interface Contract

Every provider implements `ITelematicsProvider` from `telematics/interfaces/index.ts`.

### Sync methods (write to DB)

| Method | Required | Notes |
|--------|----------|-------|
| `syncVehicleUtilization` | Yes | Daily, with verify pass |
| `syncDriverUtilization` | Yes | Daily, with verify pass |
| `syncIdlingEvents` | Yes | Daily, individual event records |
| `syncVehicleRoster` | Yes | Weekly |
| `syncSafetyEvents` | Optional | Implement when provider supports it |
| `syncFaultCodes` | Optional | Motive: `GET /v1/fault_codes` |
| `syncReeferActivity` | Optional | Motive: `GET /v1/reefer_activity_data` |

### Read methods (normalize from DB)

| Method | Returns |
|--------|---------|
| `getVehicleUtilization` | `NormalizedVehicleRecord[]` |
| `getDriverUtilization` | `NormalizedDriverRecord[]` |
| `getIdlingEvents` | `NormalizedIdlingEvent[]` |

---

## Sync Orchestration Rules

These rules apply to every sync module across all providers:

1. **Pagination is mandatory.** Any endpoint that supports pagination must be fully exhausted (`while (hasNextPage)` for Samsara cursor, `page_no` increment for Motive) before the sync completes.

2. **Sequential org processing.** Orgs are processed one at a time inside `syncDaily()`. Org N does not begin until Org N-1 is fully complete (including verify pass).

3. **Verify pass.** Each daily sync run processes two dates:
   - Primary: `yesterday` (best-effort, may not be finalized)
   - Verify: `twoDaysAgo` for Motive (48h lag), `threeDaysAgo` for Samsara (72h lag)

4. **Fuel units enforced.** Motive requests must set `X-Metric-Units: false`. Log a warning and skip unit conversion if `metric_units: true` is returned on any record.

5. **Time stored in minutes in DB, served in seconds via API.** Convert before storage:
   - Motive vehicle util: seconds ÷ 60 (API returns seconds)
   - Motive driver util: seconds ÷ 60 (API returns seconds)
   - Samsara: milliseconds ÷ 60,000
   Then in `telematicsService.ts` read path: DB minutes × 60 → seconds for the frontend.

6. **Scorecard failures are non-fatal.** `syncMotiveScorecard` returns a `SyncResult`
   with `errorCount: 1` on API failure rather than throwing. The daily sync continues
   for all other data types. See `KNOWN_LIMITATIONS.md` for root cause.

---

## Adding a New Provider

Estimated time: 0.5–1 day for a well-documented provider API.

### Step 1 — Create the provider folder

```
mkdir apps/api/src/telematics/providers/newprovider/
```

### Step 2 — Implement `ITelematicsProvider`

```typescript
// apps/api/src/telematics/providers/newprovider/index.ts
import type { ITelematicsProvider } from '../../interfaces/index.js';

export const newProviderImpl: ITelematicsProvider = {
  name: 'NEWPROVIDER',

  async syncVehicleUtilization(orgId, credential, date, verify) { ... },
  async syncDriverUtilization(orgId, credential, date, verify) { ... },
  async syncIdlingEvents(orgId, credential, date, verify) { ... },
  async syncVehicleRoster(orgId, credential) { ... },

  async getVehicleUtilization(orgId, startDate, endDate) { ... },
  async getDriverUtilization(orgId, startDate, endDate) { ... },
  async getIdlingEvents(orgId, startDate, endDate) { ... },
};
```

TypeScript will report a compile error if any required method is missing.

### Step 3 — Write sync modules

Create `sync/syncVehicleUtilization.ts`, `sync/syncDriverUtilization.ts`, etc. following the pattern in `motive/sync/` or `samsara/sync/`. Each sync module:
- Calls the provider API (with full pagination)
- Normalizes units (minutes, miles, gallons)
- Upserts to a provider-specific DB table

### Step 4 — Write the transform layer

Create `transform/` files that map raw API responses to the normalized types defined in `interfaces/index.ts`. Keep transformation logic out of sync modules — sync modules should only call, store, and report.

### Step 5 — Add a Prisma migration

Each provider has its own DB tables. Create a new Prisma migration for the provider-specific tables. Never share tables between providers.

### Step 6 — Register in the provider registry

```typescript
// telematics/registry/providerRegistry.ts — add one entry:
NEWPROVIDER: {
  syncDaily: newProviderSyncDaily,
  syncOrgForDate: (orgId, credential, date, verify) =>
    newProviderSyncOrgForDate(orgId, credential, date, verify),
},
```

Also add `'NEWPROVIDER'` to the `TelematicsProvider` enum in `telematics/types.ts` and the credential validation switch in `telematics/providers/index.ts`.

That's all. Every existing cron endpoint, admin route, and the normalization service work automatically.

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `telematics/interfaces/index.ts` | Normalized types + `ITelematicsProvider` interface |
| `telematics/registry/providerRegistry.ts` | Provider → sync function mapping |
| `telematics/types.ts` | `TelematicsProvider` enum, credential types |
| `telematics/dates.ts` | UTC boundary helpers, date arithmetic |
| `services/telematicsService.ts` | Normalization service (reads from provider DB tables) |
| `routes/telematicsNormalized.ts` | API routes that call the normalization service |
| `routes/cron.ts` | Manual sync trigger endpoints |
| `{provider}/syncService.ts` | Org queue orchestrator for that provider |
| `{provider}/client.ts` | Authenticated HTTP client for that provider |
| `{provider}/types.ts` | Raw API response types for that provider |
| `{provider}/endpoints/*.ts` | Raw API call functions |
| `{provider}/sync/*.ts` | DB write modules |
