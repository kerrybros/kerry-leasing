# Project TODO / roadmap notes

Single place for **cross-cutting** work that does not belong in a single ticket. Update this when you add placeholder pages or major gaps.

---

## Telematics

### Samsara driver data (not implemented)

The portal is **not** set up for Samsara driver-centric data today.

- **Cron / sync:** Only vehicle roster, fuel-energy (+ idling events), vehicle stats snapshots, and safety events are synced. There is no `GET /fleet/drivers`, driver–vehicle assignments, or driver utilization pipeline for Samsara.
- **Frontend:** Driver utilization, scorecard, and driver detail flows are gated on **`telematicsProvider === 'MOTIVE'`** (see `useFleetData`, driver routes). Samsara orgs get **vehicle** telematics only.
- **Onboarding impact:** If a customer uses **Samsara** and needs **driver** reporting (same as Motive today), we need a dedicated effort: schema, sync steps, API routes, UI gating, token scopes (**Read Drivers**, assignment endpoints, etc.), and updates to admin/cron reporting (e.g. `cronStepApiPaths.ts`).

Reference APIs (verify against current Samsara docs): list/retrieve drivers (`/fleet/drivers`), vehicle assignment windows (`/fleet/vehicles/driver-assignments`, `/fleet/drivers/vehicle-assignments`), plus any HOS/compliance endpoints if required.

---

## “Coming soon” / placeholder pages (customer app)

| Route | Summary |
|-------|---------|
| `/app/wip` | Work in progress — live link to shop management system |
| `/app/pm` | Preventive maintenance — LOF schedules from shop system (currently mock data + banner) |
| `/app/chat` | Messaging with the shop |
**Admin**

| Route | Summary |
|-------|---------|
| `/app/admin/documents` | Embedded SharePoint library — contracts, Exhibit B, customer documents. Requires M365 session and tenant embedding allowlist. |

Nav entries for the customer placeholders are in `apps/web/app/app/layout.tsx`.

---

## Product / UX gaps (scattered copy)

- **Driver detail (`/app/drivers/[driverId]`):** UI notes that some safety/scorecard-style data may be “not yet available from the telematics provider” — align with what Motive vs Samsara actually return after integrations are built.

---

## Codebase TODOs (non-generated)

These are worth tracking here; fix or remove the inline comment when done.

| Area | Notes |
|------|--------|
| `apps/api/src/services/telematicsService.ts` | File header mentions DB stubs; inline TODOs: real Prisma for Motive utilization; **Samsara driver utilization table not defined**. |
| `apps/api/src/routes/telematics.ts` | **Motive driving periods:** confirm with a live API whether `start_kilometers` / `end_kilometers` are miles vs km when `X-Metric-Units: false`; adjust `KM_TO_MILES` if needed (see comment ~line 575). |

Do **not** edit TODOs inside `apps/api/src/generated/**` (Prisma client output).

---

## Conventions

- Prefer linking to this file from internal docs or onboarding checklists when a gap affects customers.
- When a placeholder page ships, remove or shrink its row above and delete stale marketing copy on the page if applicable.
