# Kerry Leasing Customer Portal - Monorepo

Multi-tenant SaaS portal for fleet management with hardened auth and dual-database architecture.

## Architecture

**Frontend**: Next.js 14 (App Router) + Clerk Auth  
**Backend**: Express + TypeScript + Clerk JWT verification  
**Databases**:
- **Repair DB** (READ-ONLY): External repair/invoice data with read-only enforcement
- **App DB** (READ-WRITE): Portal-owned data (org mappings, telematics)

## Quick Start

```bash
# 1. Install
pnpm install

# 2. Configure env vars (see below)
cd apps/api && cp .env.example .env
cd apps/web && cp .env.example .env.local

# 3. Generate Prisma clients (after setting REPAIR_DATABASE_URL password)
cd apps/api
pnpm prisma:repair:pull      # Introspect repair DB schema
pnpm prisma:generate          # Generate both clients

# 4. Set up app database (optional but recommended)
pnpm prisma:app:migrate       # Create app DB tables

# 5. Start dev servers (from root)
cd ../..
pnpm dev
```

**URLs:**
- Frontend: http://localhost:3000 (or next available port)
- Backend API: http://localhost:4000

## Environment Setup

### Backend (`apps/api/.env`)

```env
# Repair Database (READ-ONLY)
REPAIR_DATABASE_URL="postgresql://fleet_saas_db_user:PASSWORD@dpg-d2mbnhidbo4c73d4shrg-a.ohio-postgres.render.com:5432/fleet_saas_db?sslmode=require&schema=public&options=-c%20default_transaction_read_only=on"

# App Database (READ-WRITE)
APP_DATABASE_URL="postgresql://user:password@localhost:5432/kerry_leasing_app"

# Clerk
CLERK_SECRET_KEY=sk_test_your_key
CLERK_PUBLISHABLE_KEY=pk_test_your_key

# Telematics credential encryption (required)
# 64-char hex string (32 bytes), same value in API + cron jobs
CREDENTIALS_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
```

### Frontend (`apps/web/.env.local`)

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_your_key
CLERK_SECRET_KEY=sk_test_your_key
NEXT_PUBLIC_API_URL=http://localhost:4000
```

## Database Architecture

### Repair Database (READ-ONLY)
- **Source**: External repair shop database
- **Access**: Read-only connection with `default_transaction_read_only=on`
- **Tables**: Units, Invoices/Repairs
- **Safety**: Repository pattern enforces read-only operations
- **Schema**: Use `prisma:repair:pull` to introspect actual schema

### App Database (READ-WRITE)
- **Source**: Portal-owned PostgreSQL
- **Tables**: 
  - `CustomerOrgMap`: Links Clerk orgId → customerId
  - `TelematicsAccount`: Provider credentials (future)
  - `TelematicsDailyMetric`: Normalized metrics (future)
- **Migrations**: Managed via `prisma:app:migrate`

## Tenant Isolation

All data access is scoped by `customerId` resolved from Clerk `orgId`:

1. User signs in with Clerk → gets `orgId`
2. API maps `orgId` → `customerId` via `CustomerOrgMap` (app DB)
3. All repair DB queries filter by `customerId`
4. Data isolation enforced at query level

## API Endpoints

**Public:**
- `GET /health`

**Auth Required:**
- `GET /me` - Get auth context (userId, orgId, role)
- `GET /units` - Get units for org (requires org mapping)
- `GET /units/:vin/repairs` - Get repair history for VIN

**Admin Only:**
- `POST /admin/link-org` - Link Clerk org to customerId
- `GET /admin/org-mappings` - List all mappings
- `GET /admin/stats` - Internal stats

## Linking Organizations

Internal users can link Clerk orgs to customer IDs:

```bash
curl -X POST http://localhost:4000/admin/link-org \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"clerkOrgId": "org_xxx", "customerId": "123"}'
```

## Development Scripts

**Root:**
```bash
pnpm dev          # Start all apps
pnpm build        # Build all apps
pnpm lint         # Lint all packages
```

**API (apps/api):**
```bash
pnpm prisma:repair:pull        # Introspect repair DB
pnpm prisma:repair:generate    # Generate repair client
pnpm prisma:app:migrate        # Migrate app DB
pnpm prisma:app:generate       # Generate app client
pnpm prisma:generate           # Generate both clients
```

## Safety Guarantees

✅ **Repair DB never modified** - Multiple layers of protection:
  - Connection string enforced with `default_transaction_read_only=on`
  - Startup validation refuses to start if safety checks fail
  - Repository pattern prevents direct Prisma client access
  - Automated tests verify safety validation logic
  
✅ **Tenant isolation** - All queries filtered by customerId  
✅ **JWT verification** - Every request authenticated  
✅ **Role-based access** - Internal vs external roles  
✅ **Clear errors** - 401 (auth), 403 (forbidden), 503 (mapping missing)

### Repair Database Safety Checks

The API performs **mandatory safety validation** on startup:

1. ✅ `REPAIR_DATABASE_URL` is present
2. ✅ Contains `sslmode=require`
3. ✅ Contains `schema=public`
4. ✅ Contains `options=-c default_transaction_read_only=on`

**If any check fails, the API will refuse to start.**

Escape hatch (local testing only):
- Set `ALLOW_UNSAFE_REPAIR_DB=true` in `.env`
- **WARNING**: NEVER use in production!

Test safety checks:
```bash
cd apps/api
pnpm test
```

## Troubleshooting

**"Organization not linked"**  
→ Admin must create mapping via `POST /admin/link-org`

**"APP_DATABASE_URL not configured"**  
→ Set up app database and run `prisma:app:migrate`

**"REPAIR_DATABASE_URL not configured"**  
→ Add repair DB password to `.env`

**Schema mismatch**  
→ Run `pnpm prisma:repair:pull` to update schema from actual DB

## Telematics Integration

### Overview
The portal integrates with Motive telematics to pull vehicle utilization, driver utilization, idle events, driving periods, and geofence data.

**Features:**
- ✅ Daily automated sync (yesterday + 2-day verification lookback)
- ✅ Historical backdate script (pull data from any start date)
- ✅ Provider-specific raw data tables (preserves API responses)
- ✅ Verification tracking (detects retroactive API data changes)
- ✅ Secure cron endpoint (protected with secret key)

### Supported Providers
- **Motive**: Full support for 5 API endpoints
  - `/v2/vehicle_utilization` - Daily vehicle metrics
  - `/v2/driver_utilization` - Daily driver metrics
  - `/v1/idle_events` - Individual idle occurrences
  - `/v1/driving_periods` - Individual trips
  - `/v1/geofences` - Location zones
- **Samsara**: Planned (schema in place)

### Configuration

#### 1. Configure Motive for an Organization
```bash
curl -X POST http://localhost:4000/admin/telematics/configure \
  -H "Authorization: Bearer <CLERK_JWT>" \
  -H "Content-Type: application/json" \
  -d '{
    "clerkOrgId": "org_xxxxx",
    "provider": "MOTIVE",
    "credentials": {
      "apiKey": "your-motive-api-key"
    }
  }'
```

#### 2. Historical Backdate (One-time per customer)

Pull historical data from a start date to present:

```bash
# Example: Pull Wolverine's data from May 1, 2025 to present
cd apps/api
pnpm backdate -- --org=org_xxxxx --start=2025-05-01 --end=2026-02-02
```

**What it does:**
- Fetches data day-by-day to avoid memory issues
- Processes 4 transactional endpoints per day
- Syncs geofences once at the end
- Rate-limited (2 seconds between days)
- Continues on errors (logs failed dates)

**Estimated time:**
- ~277 days (May 2025 - Feb 2026) = ~40 minutes

#### 3. Daily Automated Sync

**Option A: Render Cron Job (Recommended)**

Create a Render Cron Job:
- **Type**: Cron Job
- **Command**: `pnpm sync-motive`
- **Schedule**: `0 6 * * *` (6 AM EST daily)
- **Environment**: Same as API service (must include `APP_DATABASE_URL` and `CREDENTIALS_ENCRYPTION_KEY`)

**Option B: HTTP Endpoint + External Scheduler**

Hit the cron endpoint from any scheduler:

```bash
curl -X POST https://your-api.onrender.com/api/cron/sync-motive \
  -H "x-cron-secret: your-cron-secret-here"
```

**Setup:**
1. Generate a secure random string for `CRON_SECRET` in production
2. Add to both local `.env` and Render environment variables:
   ```
   CRON_SECRET=your-secure-random-string-here
   ```
3. Configure external scheduler (Render Cron, EasyCron, etc.) to hit endpoint daily

#### 4. Credential Encryption (Strict)

Telematics credentials are now strict-encrypted for both providers.

- `CREDENTIALS_ENCRYPTION_KEY` is required in:
  - API service environment
  - Motive cron job environment
  - Samsara cron job environment
- Use the same 64-char hex value in all three places.
- If any legacy plaintext rows exist, migrate them:

```bash
cd apps/api
pnpm telematics:credentials:normalize --dry-run
pnpm telematics:credentials:normalize --apply
```

### Sync Strategy

**Daily Sync Process:**
1. **Primary Sync**: Yesterday's data (all 5 endpoints)
2. **Verification Sync**: 2 days ago (re-fetch to detect changes)
3. **Geofences**: Full sync daily

**Verification Logic:**
- Compares API data vs DB records
- If data changed → increment `dataVersion`, update `lastVerifiedAt`
- If unchanged → only update `lastVerifiedAt`
- Tracks correction rate for monitoring

### Data Models

**Raw Data Tables** (5 provider-specific tables):

1. **motive_vehicle_utilization** - Daily vehicle metrics
   ```typescript
   {
     vehicleId, vin, date,
     utilizationPercentage, idleTime, drivingTime,
     idleFuel, drivingFuel, totalFuel, totalDistance,
     lastVerifiedAt, dataVersion
   }
   ```

2. **motive_driver_utilization** - Daily driver metrics
   ```typescript
   {
     driverId, date,
     utilization, idleTime, drivingTime,
     idleFuel, drivingFuel,
     lastVerifiedAt, dataVersion
   }
   ```

3. **motive_idle_events** - Individual idle occurrences
   ```typescript
   {
     motiveEventId, driverId, vehicleId, vin,
     startTime, endTime, location, fuelStart/End,
     lastVerifiedAt, dataVersion
   }
   ```

4. **motive_driving_periods** - Individual trips
   ```typescript
   {
     motivePeriodId, driverId, vehicleId, vin,
     startTime, endTime, origin, destination, distance,
     lastVerifiedAt, dataVersion
   }
   ```

5. **motive_geofences** - Location zones (config data, no verification)
   ```typescript
   {
     motiveGeofenceId, name, status,
     locationPoints, category
   }
   ```

### API Endpoints

**Admin/Internal Only:**
- `POST /admin/telematics/configure` - Configure provider for org
- `POST /admin/telematics/vehicle-map` - Map provider vehicle → VIN
- `POST /admin/telematics/sync` - Trigger manual sync

**Cron:**
- `POST /api/cron/sync-motive` - Trigger daily sync (requires `x-cron-secret` header)
- `GET /api/cron/health` - Health check

### Scripts

```bash
# Daily sync (manual testing)
pnpm sync-motive

# Historical backdate
pnpm backdate -- --org=org_xxxxx --start=2025-05-01 --end=2026-02-02

# Generate Prisma client after schema changes
pnpm prisma:app:generate
```

### Monitoring

**Basic Monitoring (Free):**
- Check `lastSyncAt` and `lastError` in `telematics_provider_accounts` table
- View Render logs for cron job execution
- Exit codes: 0 = success, 1 = partial failure

**Advanced Monitoring (Recommended):**
- **BetterStack** (free tier): Cron job health monitoring
  - Detects missed runs
  - Alerts via email/Slack/SMS
  - Historical logs
- **Slack Webhooks** (free): Real-time notifications
  - Daily sync summary
  - Error alerts
- **Sentry** (free tier): Error tracking
  - Automatic error capture
  - Stack traces
  - Performance metrics

**Monitoring Queries:**

```sql
-- Check last sync status for all orgs
SELECT 
  clerk_org_id,
  provider,
  status,
  last_sync_at,
  last_error
FROM telematics_provider_accounts
ORDER BY last_sync_at DESC;

-- Data correction rate (how often API data changes)
SELECT 
  clerk_org_id,
  COUNT(*) FILTER (WHERE data_version > 1) as corrections,
  COUNT(*) as total,
  ROUND(100.0 * COUNT(*) FILTER (WHERE data_version > 1) / COUNT(*), 2) as correction_rate_pct
FROM motive_vehicle_utilization
GROUP BY clerk_org_id;

-- Records needing verification (older than 48 hours)
SELECT COUNT(*) 
FROM motive_driving_periods
WHERE last_verified_at < NOW() - INTERVAL '48 hours';
```

### Troubleshooting

**Provider sync failing?**
1. Check API key in `telematics_provider_accounts.credentialsJson`
2. View error: Check `lastError` field
3. Test Motive API directly with key
4. Verify `APP_DATABASE_URL` is set

**Cron endpoint returns 401?**
1. Check `CRON_SECRET` matches between `.env` and request header
2. Verify `x-cron-secret` header (NOT `Authorization`)

**No data showing?**
1. Verify org has Motive configured: Check `telematics_provider_accounts`
2. Check if sync ran: Look at `lastSyncAt` timestamp
3. Run manual backdate to fill gaps
4. Check raw tables directly: `SELECT * FROM motive_vehicle_utilization LIMIT 10`

**Backdate script failed?**
1. Check date format: Must be `YYYY-MM-DD`
2. Verify org exists and has Motive configured
3. Check API key is valid and active (not test mode)
4. Review errors in console output (script continues despite errors)

### Environment Variables

**Required:**
```env
APP_DATABASE_URL="postgresql://user:pass@host:5432/db"  # App database
CRON_SECRET="your-secure-random-string"                 # Cron endpoint auth
```

**Optional:**
```env
SLACK_WEBHOOK_URL="https://hooks.slack.com/..."        # For notifications
SENTRY_DSN="https://xxx@sentry.io/xxx"                 # For error tracking
```

1. Get repair DB password
2. Run `prisma:repair:pull` to introspect schema
3. Update model mappings if needed
4. Create org mappings for test users
5. Test units and repair endpoints
