# Email Template Color Scheme

Shared palette and conventions for all Clerk email templates (invitations, magic-link sign-in, verification, password reset, etc.). Clerk's dashboard uses a custom DSL with `<re-*>` tags — not raw HTML.

## Palette

Pulled from the Kerry Brothers Truck Repair logo family.

| Role | Hex | Source |
|---|---|---|
| Primary navy | `#1e3a6f` | "Kerry Brothers Truck Repair" wordmark |
| Steel blue | `#3b7ab5` | KL circle mark |
| Page background | `#f4f4f5` | Neutral gray, makes card pop |
| Card background | `#ffffff` | — |
| Heading text | `#1e3a6f` | Primary navy |
| Body text | `#52525b` | Zinc 600 |
| Muted text | `#71717a` | Zinc 500 |
| Footer text | `#a1a1aa` | Zinc 400 |
| Strong text | `#18181b` | Zinc 900 |
| Divider (light) | `#e4e4e7` | Zinc 200 |
| Button text on navy | `#ffffff` | — |

## Usage conventions

- **Top accent bar**: 4px `<re-divider background-color="#3b7ab5" height="4px">` at the top of `<re-main>`.
- **Card**: `<re-main background-color="#ffffff" border-radius="12px">` on the `#f4f4f5` body.
- **Body padding**: `<re-body padding="40px 16px 40px 16px">` — gives breathing room on mobile.
- **Inner block padding**: `<re-block padding="40px 40px 40px 40px">`.
- **CTA button**: navy bg `#1e3a6f`, white text, `border-radius="8px"`, `padding="14px 32px 14px 32px"`, `font-size="15px"`, `font-weight="bold"`.
- **Fallback link**: `<a style="text-decoration: underline; color: #1e3a6f;">`.
- **Security footnote** (e.g. "Didn't request this?"): separate with a light `#e4e4e7` divider before the block.
- **Center-aligned** content inside the card for invitation / verification flows.

## Typography

- Heading (h1): `font-size="26px"`, `line-height="34px"`, `font-weight="bold"`, color navy.
- Body: `font-size="15px"`, `line-height="24px"`, color `#52525b`.
- Small/muted: `font-size="13px"`, `line-height="20px"`, color `#71717a`.
- Footer: `font-size="12px"`, color `#a1a1aa`.

## DSL notes

Clerk's templates use `<re-*>` tags, not HTML. Known components:
`<re-html>`, `<re-head>`, `<re-title>`, `<re-body>`, `<re-preheader>`, `<re-var>`,
`<re-header>`, `<re-main>`, `<re-footer>`, `<re-block>`, `<re-heading>`,
`<re-text>`, `<re-button>`, `<re-divider>`.

Attributes accept CSS-like values: `background-color`, `color`, `padding`,
`margin`, `font-size`, `font-weight`, `line-height`, `border-radius`, `align`,
`height`, `href`, `level`.

Raw `<a>` tags are allowed inside `<re-text>` for inline links; use inline
`style="..."` there (the DSL attributes don't apply to raw HTML children).

## Handlebars variables

Common variables available across templates:

- `{{app.name}}` — application name
- `{{> app_logo}}` — partial that renders the app logo
- `{{current_year}}` — for copyright
- `{{action_url}}` — invitation accept URL
- `{{magic_link}}` — magic-link / verification URL
- `{{ttl_minutes}}` — link expiry window (minutes)
- `{{invitation.expires_in_days}}` — invitation expiry (days)
- `{{requested_from}}`, `{{requested_at}}` — security context for magic-link emails
