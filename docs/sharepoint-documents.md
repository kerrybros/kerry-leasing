# SharePoint documents (Microsoft Graph)

The admin **Documents** page uses Microsoft Graph **app-only** access to list files from the Kerry Leasing SharePoint document library.

**Secrets:** Do not put Graph credentials on Vercel. Set the env vars below on the **API service only** (e.g. Render).

## API environment variables

| Variable | Description |
|---|---|
| `MICROSOFT_GRAPH_TENANT_ID` | Directory (tenant) ID from Entra |
| `MICROSOFT_GRAPH_CLIENT_ID` | Application (client) ID from Entra |
| `MICROSOFT_GRAPH_CLIENT_SECRET` | Client secret value (rotate annually) |
| `MICROSOFT_GRAPH_SITE_HOSTNAME` | e.g. `kerrybros.sharepoint.com` |
| `MICROSOFT_GRAPH_SITE_PATH` | e.g. `/sites/KerryLeasing` (leading slash, no hostname) |

The route returns **503** if `MICROSOFT_GRAPH_TENANT_ID` is absent, so the API can boot without Graph configured.

## Entra / SharePoint one-time setup (once per environment)

**A. App registration**

1. [Entra admin center](https://entra.microsoft.com/) → Identity → Applications → App registrations → **New registration**.
2. Name: `Kerry Leasing – SharePoint documents (Graph)`. Account type: *This org only* (single-tenant).
3. Copy **Application (client) ID** and **Directory (tenant) ID** → API env vars.

**B. Client secret**

4. Certificates & secrets → **New client secret** → copy the **Value** once → `MICROSOFT_GRAPH_CLIENT_SECRET`.

**C. API permission + consent**

5. API permissions → Add → Microsoft Graph → **Application permissions** → add **`Sites.Selected`** only.
6. **Grant admin consent** for your org (requires Global Admin or Privileged Role Admin).

**D. Grant the app access to the specific site** *(required — `Sites.Selected` is opt-in per site)*

7. Without this step the API returns 502 (Graph 403) even after consent.
8. Resolve the site ID: `GET https://graph.microsoft.com/v1.0/sites/kerrybros.sharepoint.com:/sites/KerryLeasing` using Graph Explorer or any authenticated caller.
9. POST to `https://graph.microsoft.com/v1.0/sites/{siteId}/permissions` per the [Create site permission docs](https://learn.microsoft.com/en-us/graph/api/site-post-permissions), granting your app's client ID the minimum read role.

**E. Smoke test**

10. Deploy the API with the env vars, sign in as an **internal** Clerk user, open Admin → Documents.
11. **502 / Graph Forbidden?** Re-check step D — the site grant is the most common miss.
12. **Items load but a user can't open a file?** That user lacks SharePoint permission on those files. Fix in SharePoint, not in this app.

## Security note

Rotate `MICROSOFT_GRAPH_CLIENT_SECRET` on a schedule (recommend annually). See also [CONTRIBUTING.md](../CONTRIBUTING.md#security) for general secret hygiene.
