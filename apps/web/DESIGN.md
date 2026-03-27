# Kerry Leasing - Design Standard

## Brand Hierarchy
- **Primary:** Kerry Leasing
- **Secondary:** Kerry Brothers Truck Repair

## Color Palette (Dark & Light Mode)
Baseline accent color is Gold (`#d9a528`).

### CSS Variables (Tokens)

**Light Theme:**
- `--background`: `#f8fafc`
- `--foreground`: `#0f172a`
- `--card`: `#ffffff`
- `--card-foreground`: `#0f172a`
- `--popover`: `#ffffff`
- `--popover-foreground`: `#0f172a`
- `--primary`: `#d9a528`
- `--primary-foreground`: `#ffffff`
- `--secondary`: `#f1f5f9`
- `--secondary-foreground`: `#475569`
- `--muted`: `#f1f5f9`
- `--muted-foreground`: `#64748b`
- `--accent`: `#f1f5f9`
- `--accent-foreground`: `#0f172a`
- `--destructive`: `#dc2626`
- `--destructive-foreground`: `#ffffff`
- `--border`: `#e2e8f0`
- `--input`: `#e2e8f0`
- `--ring`: `#d9a528`
- `--radius`: `0.75rem`

**Dark Theme:**
- `--background`: `#0a0f1a`
- `--foreground`: `#ffffff`
- `--card`: `#1e2936`
- `--card-foreground`: `#ffffff`
- `--popover`: `#1e2936`
- `--popover-foreground`: `#ffffff`
- `--primary`: `#d9a528`
- `--primary-foreground`: `#ffffff`
- `--secondary`: `#131b2e`
- `--secondary-foreground`: `#94a3b8`
- `--muted`: `#1a2332`
- `--muted-foreground`: `#94a3b8`
- `--accent`: `#252f3f`
- `--accent-foreground`: `#ffffff`
- `--destructive`: `#ef4444`
- `--destructive-foreground`: `#ffffff`
- `--border`: `#2d3748`
- `--input`: `#2d3748`
- `--ring`: `#d9a528`

## Typography
- **Font Family:** Inter (or standard sans-serif fallback)
- **Weights:** Regular (400), Medium (500), Semibold (600), Bold (700)
- **Size Scale:** Standard Tailwind scale

## Chart Library Decision
**Recharts**
*Rationale:* Recharts is already installed in the project and heavily utilized in the current `fleet/page.tsx` for complex data visualizations. Sticking with Recharts avoids an unnecessary and massive rewrite of existing chart logic, while still allowing us to upgrade the visual design using our new theme tokens.

## shadcn/ui Component List
The following components will be used and installed:
`button`, `card`, `table`, `dialog`, `badge`, `tabs`, `select`, `input`, `sheet`, `sidebar`, `tooltip`, `skeleton`, `dropdown-menu`, `scroll-area`

## Sidebar Behavior Spec
- **Collapsed Width:** `4rem` (64px)
- **Expanded Width:** `16rem` (256px)
- **Mobile Breakpoint:** `1024px` (lg) - Uses a Sheet/drawer component for mobile responsiveness.

## Driver Scorecard Formula
Formula weights for calculating driver score (0-100):
- **Idle % (40% weight):** Lower is better.
- **MPG (40% weight):** Scored relative to fleet average.
- **Safety Events (20% weight):** Subtract points per event (currently stubbed for future implementation).

## Damage Detection Rule
Flag a repair job as damage if:
`(field ?? '').toLowerCase().includes('damage')`
This is applied to both the `component` and `system` fields.

## Immutable Rules
- No dollar figures anywhere.
- No emoji anywhere.
- No "Coming Soon" placeholders.
- No unused dead code.
