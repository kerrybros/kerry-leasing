# Samsara Telematics Integration

This document describes the Samsara telematics integration parallel to the existing Motive integration.

## Overview

The Samsara integration is structured identically to the Motive integration, ensuring both providers can run alongside each other without conflicts. Each organization can be configured with either MOTIVE or SAMSARA (not both).

## Architecture

### Data Flow

```
Samsara API → syncService → endpoints → Prisma → samsara_raw_data table
                                              → telematics_daily_metrics (normalized)
```

### Directory Structure

```
apps/api/src/telematics/samsara/
├── client.ts                    # Samsara API HTTP client
├── types.ts                     # TypeScript interfaces
├── syncService.ts               # Main orchestrator
├── backdate.ts                  # Historical data script
├── endpoints/
│   └── vehicleStats.ts         # Fetches vehicle stats
└── sync/
    └── syncVehicleStats.ts     # Syncs to database
```

## Database Schema

### samsara_raw_data Table

Stores raw Samsara vehicle statistics:

```prisma
model SamsaraRawData {
  id                  String    @id @default(cuid())
  clerkOrgId          String    @map("clerk_org_id")
  vehicleId           String    @map("vehicle_id")
  vin                 String?
  vehicleName         String?   @map("vehicle_name")
  date                String    // YYYY-MM-DD
  startTime           String?   @map("start_time")
  endTime             String?   @map("end_time")
  
  // Odometer (meters)
  odometerStart       Float?    @map("odometer_start")
  odometerEnd         Float?    @map("odometer_end")
  
  // Fuel (milliliters)
  fuelConsumedStart   Float?    @map("fuel_consumed_start")
  fuelConsumedEnd     Float?    @map("fuel_consumed_end")
  
  // Idle (milliseconds)
  idleDurationStart   Float?    @map("idle_duration_start")
  idleDurationEnd     Float?    @map("idle_duration_end")
  
  // Engine hours (milliseconds)
  engineHoursStart    Float?    @map("engine_hours_start")
  engineHoursEnd      Float?    @map("engine_hours_end")
  
  rawResponse         Json      @map("raw_response")
  processedAt         DateTime? @map("processed_at")
  createdAt           DateTime  @default(now()) @map("created_at")

  @@unique([clerkOrgId, vehicleId, date])
}
```

## Configuration

### 1. Set up Samsara for an Organization

```bash
curl -X POST http://localhost:4000/admin/telematics/configure \
  -H "Authorization: Bearer <CLERK_JWT>" \
  -H "Content-Type: application/json" \
  -d '{
    "clerkOrgId": "org_xxxxx",
    "provider": "SAMSARA",
    "credentials": {
      "apiToken": "your-samsara-api-token"
    }
  }'
```

### 2. Historical Backdate

Pull historical data from a start date to present:

```bash
cd apps/api
pnpm backdate-samsara -- --org=org_xxxxx --start=2025-05-01 --end=2026-02-09
```

**What it does:**
- Fetches data day-by-day to avoid memory issues
- Processes vehicle stats for each day
- Rate-limited (2 seconds between days)
- Continues on errors (logs failed dates)

### 3. Daily Automated Sync

**Option A: Render Cron Job (Recommended)**

Create a Render Cron Job:
- **Type**: Cron Job
- **Command**: `pnpm sync-samsara`
- **Schedule**: `0 6 * * *` (6 AM EST daily)
- **Environment**: Same as API service (must include `APP_DATABASE_URL`)

**Option B: HTTP Endpoint + External Scheduler**

Hit the cron endpoint from any scheduler:

```bash
curl -X POST https://your-api.onrender.com/api/cron/sync-samsara \
  -H "x-cron-secret: your-cron-secret-here"
```

## API Endpoints

### Tenant-Scoped (Authenticated)

- `GET /telematics/daily` - Get normalized daily metrics (all providers)
- `GET /telematics/summary` - Get aggregated metrics
- `GET /telematics/samsara/vehicle-stats` - Get raw Samsara data

### Admin/Internal Only

- `POST /admin/telematics/configure` - Configure provider for org
- `POST /admin/telematics/vehicle-map` - Map provider vehicle → VIN
- `POST /admin/telematics/sync` - Trigger manual sync

### Cron Endpoints

- `POST /api/cron/sync-samsara` - Trigger daily sync (requires `x-cron-secret` header)
- `GET /api/cron/health` - Health check

## Scripts

```bash
# Daily sync (manual testing)
pnpm sync-samsara

# Historical backdate
pnpm backdate-samsara -- --org=org_xxxxx --start=2025-05-01 --end=2026-02-09

# Generate Prisma client after schema changes
pnpm prisma:app:generate
```

## Sync Strategy

**Daily Sync Process:**
1. **Primary Sync**: Yesterday's data
2. **Verification Sync**: 2 days ago (re-fetch to detect changes)

**Verification Logic:**
- Compares API data vs DB records
- If data changed → updates record with new data
- If unchanged → only updates `processedAt` timestamp

## Data Differences: Samsara vs Motive

### Samsara
- Uses **cursor-based pagination** (hasNextPage, endCursor)
- Data is **delta-based** (start/end values)
- Measurements in **metric units** (meters, milliliters, milliseconds)
- Single endpoint for vehicle stats
- Max 512 results per page

### Motive
- Uses **page-number pagination** (page, per_page, total)
- Data is **aggregate-based** (daily totals)
- Measurements in **imperial units** (miles, gallons, seconds)
- Multiple endpoints (vehicle util, driver util, idle events, driving periods, geofences)
- Max 100 results per page

## Provider Isolation

Both providers are completely isolated:

1. **Database Level**: Separate tables
   - `samsara_raw_data` ← Samsara only
   - `motive_vehicle_utilization`, `motive_driver_utilization`, etc. ← Motive only

2. **Code Level**: Separate directories
   - `src/telematics/samsara/` ← Samsara implementation
   - `src/telematics/motive/` ← Motive implementation

3. **Sync Level**: Separate cron jobs
   - `sync-samsara-daily.ts` ← Samsara sync
   - `sync-motive-daily.ts` ← Motive sync

4. **Account Level**: Provider field enforces one per org
   - `TelematicsProviderAccount.provider` = SAMSARA | MOTIVE
   - Unique constraint on `clerkOrgId`

## Monitoring

### Basic Monitoring
- Check `lastSyncAt` and `lastError` in `telematics_provider_accounts` table
- View Render logs for cron job execution
- Exit codes: 0 = success, 1 = partial failure

### Monitoring Queries

```sql
-- Check last sync status for all Samsara orgs
SELECT 
  clerk_org_id,
  provider,
  status,
  last_sync_at,
  last_error
FROM telematics_provider_accounts
WHERE provider = 'SAMSARA'
ORDER BY last_sync_at DESC;

-- Count Samsara records per org
SELECT 
  clerk_org_id,
  COUNT(*) as record_count,
  MIN(date) as earliest_date,
  MAX(date) as latest_date
FROM samsara_raw_data
GROUP BY clerk_org_id;
```

## Troubleshooting

**Provider sync failing?**
1. Check API token in `telematics_provider_accounts.credentialsJson`
2. View error: Check `lastError` field
3. Test Samsara API directly with token
4. Verify `APP_DATABASE_URL` is set

**Cron endpoint returns 401?**
1. Check `CRON_SECRET` matches between `.env` and request header
2. Verify `x-cron-secret` header (NOT `Authorization`)

**No data showing?**
1. Verify org has Samsara configured: Check `telematics_provider_accounts`
2. Check if sync ran: Look at `lastSyncAt` timestamp
3. Run manual backdate to fill gaps
4. Check raw tables directly: `SELECT * FROM samsara_raw_data LIMIT 10`

**Backdate script failed?**
1. Check date format: Must be `YYYY-MM-DD`
2. Verify org exists and has Samsara configured
3. Check API token is valid and active
4. Review errors in console output (script continues despite errors)

## Environment Variables

**Required:**
```env
APP_DATABASE_URL="postgresql://user:pass@host:5432/db"  # App database
CRON_SECRET="your-secure-random-string"                 # Cron endpoint auth
```

## Migration from Motive

If an organization needs to switch from Motive to Samsara:

1. Update the provider account:
```sql
UPDATE telematics_provider_accounts
SET provider = 'SAMSARA',
    credentials_json = '{"apiToken": "samsara-token-here"}',
    status = 'ACTIVE',
    last_error = NULL
WHERE clerk_org_id = 'org_xxxxx';
```

2. Run backdate to populate historical Samsara data
3. Motive data remains in place for historical reference
