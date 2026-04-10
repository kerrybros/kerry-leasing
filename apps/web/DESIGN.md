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

## Tailwind Utility Mapping Reference

All UI is built with Tailwind utilities that map to the CSS token layer. Custom `@layer components` classes have been removed. Use the following mappings when building new components:

| Intent | Tailwind Utility | CSS Token |
|---|---|---|
| Page background | `bg-background` | `--background` |
| Card / panel background | `bg-card` | `--card` |
| Muted / subtle background | `bg-muted` | `--muted` |
| Hover highlight | `bg-accent` | `--accent` |
| Primary brand color | `bg-primary` / `text-primary` | `--primary` |
| Primary text | `text-foreground` | `--foreground` |
| Secondary / label text | `text-muted-foreground` | `--muted-foreground` |
| Destructive / error | `text-destructive` / `bg-destructive` | `--destructive` |
| Border | `border-border` | `--border` |
| Input border | `border-input` | `--input` |
| Focus ring | `ring-ring` | `--ring` |
| Status success | `text-[var(--success)]` | `--success` |
| Status warning | `text-[var(--warning)]` | `--warning` |
| Status error | `text-[var(--error)]` | `--error` |

### Layout Conventions

- **Page wrapper:** `max-w-[1400px] mx-auto px-4 sm:px-6`
- **Page header row:** `flex justify-between items-center gap-4 mb-8 flex-wrap`
- **Two-column grid:** `grid grid-cols-2 lg:grid-cols-1 gap-8`
- **Three-column grid:** `grid grid-cols-3 md:grid-cols-1 gap-6`
- **Five-column KPI grid:** `grid grid-cols-5 md:grid-cols-1 gap-4`
- **Section loading state:** `flex items-center justify-center py-12 text-muted-foreground`
- **Error state:** `flex items-center justify-center py-12 text-destructive`
- **Scrollable table container:** `overflow-x-auto rounded-xl border border-border`

### Tab Bar Pattern

```tsx
// Tab container
<div className="flex gap-2 border-b border-border mb-8">
  // Inactive tab
  <button className="px-6 py-3 text-muted-foreground font-medium border-b-2 border-transparent -mb-px hover:text-foreground">
  // Active tab
  <button className="px-6 py-3 text-primary font-medium border-b-2 border-primary -mb-px">
```

## Immutable Rules
- No dollar figures anywhere.
- No emoji anywhere.
- No "Coming Soon" placeholders.
- No unused dead code.
