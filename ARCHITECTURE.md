# Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     KERRY LEASING MONOREPO                      │
└─────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────────┐
│                          AUTHENTICATION                               │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                        Clerk Auth                            │   │
│  │  - JWT token generation                                      │   │
│  │  - Organization management                                   │   │
│  │  - User management                                           │   │
│  │  - Role assignment                                           │   │
│  └──────────────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    │                           │
                    ▼                           ▼
    
┌───────────────────────────┐       ┌───────────────────────────┐
│      FRONTEND (Web)       │       │     BACKEND (API)         │
│     Next.js 14 (TS)       │◄─────►│   Express + TS + Prisma   │
│                           │       │                           │
│  Clerk Client             │       │  Clerk Server             │
│  - <ClerkProvider>        │       │  - clerkClient            │
│  - useAuth()              │       │  - verifyToken()          │
│  - useOrganization()      │       │                           │
│                           │       │  Auth Middleware          │
│  Protected Routes         │       │  - JWT verification       │
│  - /app/*                 │       │  - Extract orgId          │
│  - middleware.ts          │       │  - req.auth context       │
│                           │       │                           │
│  API Client               │       │  Route Guards             │
│  - api.get('/units')      │       │  - requireOrg()           │
│  - Auto JWT injection     │       │  - requireRole()          │
│                           │       │                           │
│  Pages:                   │       │  Endpoints:               │
│  - /sign-in               │       │  - GET /health            │
│  - /sign-up               │       │  - GET /me                │
│  - /app (dashboard)       │       │  - GET /units             │
│                           │       │  - GET /admin/stats       │
└───────────────────────────┘       └─────────────┬─────────────┘
       localhost:3000                             │
                                                  │
                                                  ▼
                                    ┌─────────────────────────┐
                                    │   PostgreSQL Database   │
                                    │      via Prisma         │
                                    │                         │
                                    │  Models:                │
                                    │  - OrgTelematicsAccount │
                                    │  - TelematicsDailyMetric│
                                    │  - Unit                 │
                                    │  - Repair               │
                                    └─────────────────────────┘
                                           localhost:5432

┌───────────────────────────────────────────────────────────────────────┐
│                         SHARED PACKAGE                                │
│                      @kerry-leasing/shared                            │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Zod Schemas          │  TypeScript Types                    │   │
│  │  - unitSchema         │  - Unit                              │   │
│  │  - repairSchema       │  - Repair                            │   │
│  │  - dailyMetricSchema  │  - DailyMetric                       │   │
│  │  - authInfoSchema     │  - AuthInfo                          │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                Used by both Web and API                               │
└───────────────────────────────────────────────────────────────────────┘


┌───────────────────────────────────────────────────────────────────────┐
│                       REQUEST FLOW EXAMPLE                            │
└───────────────────────────────────────────────────────────────────────┘

1. User visits /app
   │
   ├─► Clerk middleware checks auth
   │   ├─► If not signed in → redirect to /sign-in
   │   └─► If signed in → continue
   │
2. Page loads, user clicks "Load Units"
   │
   ├─► api.get('/units') called
   │   ├─► useAuth() gets Clerk token
   │   └─► Adds "Authorization: Bearer <token>"
   │
3. Request sent to API at localhost:4000/units
   │
   ├─► CORS middleware allows origin
   ├─► clerkAuthMiddleware runs
   │   ├─► Extract token from header
   │   ├─► Verify with Clerk
   │   ├─► Get userId, orgId, role
   │   └─► Set req.auth = { userId, orgId, role }
   │
   ├─► requireOrg middleware runs
   │   ├─► Check req.auth.orgId exists
   │   └─► If not → 403 error
   │
4. Route handler executes
   │
   ├─► Query Prisma
   │   └─► WHERE clerkOrgId = req.auth.orgId
   │
5. Return filtered results
   │
   └─► Response: { units: [], count: 0, orgId: "org_xxx" }


┌───────────────────────────────────────────────────────────────────────┐
│                      MULTI-TENANT ISOLATION                           │
└───────────────────────────────────────────────────────────────────────┘

Organization A (org_abc123)              Organization B (org_xyz789)
        │                                         │
        ├─ User 1 ───┐                           ├─ User 3 ───┐
        └─ User 2 ───┤                           └─ User 4 ───┤
                     │                                        │
                     ▼                                        ▼
         ┌────────────────────┐              ┌────────────────────┐
         │   Units for Org A  │              │   Units for Org B  │
         │   Repairs for Org A│              │   Repairs for Org B│
         │   Metrics for Org A│              │   Metrics for Org B│
         └────────────────────┘              └────────────────────┘
                     │                                        │
                     └────────────┬───────────────────────────┘
                                  │
                     All stored in same database
                     But filtered by clerkOrgId


┌───────────────────────────────────────────────────────────────────────┐
│                         DEVELOPMENT FLOW                              │
└───────────────────────────────────────────────────────────────────────┘

┌─────────────┐
│  Terminal   │    pnpm dev (from root)
└──────┬──────┘
       │
       ├──► Turbo starts all apps concurrently
       │
       ├──► Web: next dev (port 3000)
       │    └─► Hot reload enabled
       │
       └──► API: tsx watch src/index.ts (port 4000)
            └─► Auto-restart on file changes


┌───────────────────────────────────────────────────────────────────────┐
│                      DEPLOYMENT ARCHITECTURE                          │
└───────────────────────────────────────────────────────────────────────┘

┌─────────────────┐         ┌─────────────────┐         ┌──────────────┐
│   Vercel        │         │   Render        │         │  PostgreSQL  │
│   (Frontend)    │◄───────►│   (Backend)     │◄───────►│  (Database)  │
│                 │         │                 │         │              │
│  - Auto deploy  │         │  - Node.js      │         │  - Managed   │
│  - Edge network │         │  - Docker       │         │  - Backups   │
│  - SSL included │         │  - Auto scale   │         │  - SSL       │
└─────────────────┘         └─────────────────┘         └──────────────┘
        │                           │
        └───────────┬───────────────┘
                    │
                    ▼
        ┌───────────────────────┐
        │   Clerk (Auth SaaS)   │
        │  - JWT verification   │
        │  - User management    │
        │  - Organization mgmt  │
        └───────────────────────┘


┌───────────────────────────────────────────────────────────────────────┐
│                        TECH STACK SUMMARY                             │
└───────────────────────────────────────────────────────────────────────┘

Frontend:
  ├─ Next.js 14 (App Router)
  ├─ React 18
  ├─ TypeScript 5.3
  ├─ Clerk React SDK
  └─ Native CSS (ready for Tailwind)

Backend:
  ├─ Node.js 18+
  ├─ Express 4
  ├─ TypeScript 5.3
  ├─ Clerk Backend SDK
  ├─ Prisma 5
  └─ PostgreSQL

Build System:
  ├─ pnpm (package manager)
  ├─ Turbo (monorepo orchestration)
  └─ TypeScript (compilation)

Code Quality:
  ├─ ESLint (linting)
  ├─ Prettier (formatting)
  └─ Zod (runtime validation)
```
