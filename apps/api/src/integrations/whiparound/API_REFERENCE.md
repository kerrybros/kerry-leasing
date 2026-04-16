# Whip Around public API — captured reference

Internal snapshot of the **public** developer hub (Scribe-generated). For full request/response examples and try-it-out UI, use the live source:

https://api.whip-around.com/api-docs/public

**Hub “Last updated” (per page):** April 15, 2026

This file is **documentation only** — no runtime code. A follow-on effort will design sync, storage, and portal UI against these endpoints.

---

## Base URL and version

All examples use:

`https://api.whip-around.com/api/public/v4/`

Path fragments below are relative to that prefix (e.g. `GET inspections` → `GET …/v4/inspections`).

---

## Authentication

- Header: **`x-api-key: <YOUR_API_KEY>`**
- **Personal API keys:** limited; some APIs (e.g. creating fuel transactions) are called out as **integration-only**.
- **Integration API keys:** broader access; telematics-style operations (e.g. defects, odometer) are described as integration-key scenarios in the hub.
- API key creation/revocation is **admin-only** in the Whip Around product.

---

## Pagination and responses

- **Cursor pagination:** large collections (the hub explicitly mentions **inspections**). Response shape includes `data` plus `meta` with `next_cursor`, `previous_cursor`, `result_count`.
- **Classic pagination:** `page`, `limit`, and a `pagination` object for smaller collections.
- **HTTP status codes:** standard RFC 9110 semantics (described in the Introduction section of the hub).

---

## Endpoints by domain

Method and path templates match the public hub. `{id}` is a numeric resource id unless noted.

### Assets

| Method | Path | Summary (from hub section titles) |
|--------|------|----------------------------------|
| GET | `assets` | List assets (`include[]` supported) |
| POST | `assets` | Create an asset |
| DELETE | `assets/{id}` | Delete an asset |
| PATCH | `assets/{id}` | Update an asset |
| GET | `assets/{id}/mileage-history` | List mileage history |
| GET | `assets/{id}/engine-hours-history` | List engine hours history |

### Defects

| Method | Path | Summary |
|--------|------|---------|
| GET | `defects` | List defects (`include` / related resources in hub) |
| POST | `defects` | Create a manual defect |
| PATCH | `defects/{id}` | Update a defect |

### Drivers

| Method | Path | Summary |
|--------|------|---------|
| GET | `drivers` | List drivers |
| POST | `drivers` | Create driver |
| GET | `drivers/wellness-reports` | List driver wellness reports |
| DELETE | `drivers/{id}` | Delete a driver |
| PATCH | `drivers/{id}` | Update driver |

### Fuel

| Method | Path | Summary |
|--------|------|---------|
| GET | `fuel-transactions` | List fuel transactions (query: ordering, pagination, `asset_id`, etc.) |
| POST | `fuel-transactions` | Create fuel transaction (integration-key expectations described in hub) |
| GET | `fuel-vendors` | List fuel vendors |
| POST | `fuel-vendors` | Create fuel vendor |
| DELETE | `fuel-vendors/{id}` | Delete a fuel vendor |

### Inspections (primary for portal `/app/whiparound`)

| Method | Path | Summary |
|--------|------|---------|
| GET | `inspections` | List inspections — **cursor** pagination (`meta.next_cursor`, etc.) |

**Notable query parameters (list inspections):**

- `datetime_from`, `datetime_to` (optional; `datetime_to` must be after `datetime_from`)
- `limit` (optional, ≥ 1, ≤ 1000)
- `keyword` (optional, max 255 chars)
- `cursor` (optional)
- `asset_id` (optional)
- `include[]` — e.g. `team` (hub: must be one of allowed includes)

**Example fields** on inspection objects in the hub sample include: `id`, `driver_id`, `driver_name`, `asset_id`, `team_id`, `form_id`, `completion`, `created_at`, start/end lat/long, duration, `inspection_ended_on_device`, `passed`, `pdf_url`, etc. Confirm full schema on the live hub.

### Integrations

| Method | Path | Summary |
|--------|------|---------|
| POST | `integrations/fullbay` | Enable Fullbay integration |
| DELETE | `integrations/fullbay` | Disable Fullbay integration |
| POST | `integrations/azuga/webhook-events` | Handle Azuga webhook event |

### Inventory

| Method | Path | Summary |
|--------|------|---------|
| GET | `inventories` | List inventory |

### Reseller

| Method | Path | Summary |
|--------|------|---------|
| GET | `reseller/customers` | List customers managed by reseller |
| POST | `reseller/customers` | Create reseller customer |
| POST | `reseller/customers/{id}/api-keys` | Create integration API key for a managed customer |
| POST | `reseller/customers/{id}/subscription` | Create subscription for reseller customer |
| DELETE | `reseller/customers/{id}/subscription` | Cancel subscription (`immediately` query discussed in hub) |

### Services

| Method | Path | Summary |
|--------|------|---------|
| GET | `services` | List services (`include[]` in examples) |

### Teams

| Method | Path | Summary |
|--------|------|---------|
| GET | `teams` | List teams (classic pagination in examples) |

### Telematics (asset identifiers)

Paths use **`{idOrVin}`** — asset id or VIN.

| Method | Path | Summary |
|--------|------|---------|
| POST | `assets/{idOrVin}/mileage` | Update asset mileage (body: `value`, `unit` — `mi` or `km`) |
| POST | `assets/{idOrVin}/engine-hours` | Update asset engine hours |
| POST | `assets/{idOrVin}/location` | Update asset location |
| POST | `assets/{idOrVin}/dtc-defects` | Create DTC defect |

### Users

| Method | Path | Summary |
|--------|------|---------|
| GET | `users` | List users |
| POST | `users` | Create user |
| DELETE | `users/{id}` | Delete a user |

### Work orders

| Method | Path | Summary |
|--------|------|---------|
| GET | `work-orders` | List work orders (e.g. date filters in examples) |
| GET | `work-orders/{id}` | Get work order details |

---

## Gaps and caveats

- **Rate limits / throttling:** not described in the captured public text; confirm with Whip Around if bulk-syncing inspections.
- **Webhooks:** the public hub documents a vendor-specific Azuga webhook path; there is no generic “all events” webhook index in this capture — confirm product support for push vs poll.
- **Example encoding:** some generated `curl`/`include` examples in Scribe use awkward query encoding; prefer the hub’s parameter tables when implementing clients.
- **Scope:** this list reflects **v4 public** docs only. Behavior may differ by key type (personal vs integration).

---

## Kerry portal alignment (future integration)

- **Near-term UI:** [`apps/web/app/app/whiparound/page.tsx`](../../../../../apps/web/app/app/whiparound/page.tsx) — replace mock data with data sourced from **`GET /inspections`** (cursor loop + filters), joined with **`GET /assets`** / **`GET /drivers`** as needed for display.
- **Multi-tenant:** map each Clerk org (or customer) to Whip Around business + API key storage pattern (not defined here).

When integration work starts, add implementation notes alongside this file or link a short ADR from [`TODO.md`](../../../../../TODO.md).
