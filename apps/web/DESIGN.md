# Kerry Leasing Portal - Design System

## Overview
The Kerry Leasing Portal uses a **TruckGenius-inspired design system** with dual theme support (dark and light modes). The design emphasizes clarity, professionalism, and data-rich visualizations for fleet management.

**Core Rules:**
- **No Emojis:** Do not use emojis in the UI. Use SVG icons if visual indicators are needed.
- **Dashboard Layout:** Charts on the left, detailed tables on the right.
- **Color Consistency:** Use CSS variables for all theming.

---

## Color Schemes

### Dark Theme (Default)
**Background Colors:**
- Primary Background: `#0a0f1a` (Deep navy blue)
- Secondary Background: `#131b2e` (Navy)
- Tertiary Background: `#1a2332` (Lighter navy)
- Card Background: `#1e2936` (Card containers)
- Hover State: `#252f3f` (Interactive elements)

**Text Colors:**
- Primary Text: `#ffffff` (White)
- Secondary Text: `#94a3b8` (Light gray)
- Tertiary Text: `#64748b` (Muted gray)

**Accent Colors:**
- Primary (Bright Blue): `#00a8ff` - Used for CTAs, active states, links
- Primary Dark: `#0080cc` - Used for Chart Headers, Table Headers, Hover states
- Primary Light: `#33b8ff` - Highlights

**Status Colors:**
- Success: `#10b981` (Green) - Used for positive metrics (good idle %, MPG)
- Warning: `#f59e0b` (Amber/Gold) - Used for Chart Lines, concerning metrics
- Error: `#ef4444` (Red) - Error states, critical alerts

**Borders & Dividers:**
- Border: `#2d3748`
- Border Light: `#374151`

---

### Light Theme
**Background Colors:**
- Primary Background: `#f8fafc` (Light gray)
- Secondary Background: `#ffffff` (White)
- Tertiary Background: `#f1f5f9` (Off-white)
- Card Background: `#ffffff` (White cards)
- Hover State: `#f1f5f9` (Light gray)

**Text Colors:**
- Primary Text: `#0f172a` (Dark navy)
- Secondary Text: `#475569` (Medium gray)
- Tertiary Text: `#64748b` (Light gray)

**Accent Colors:**
- Primary (Bright Blue): `#0891b2`
- Primary Dark: `#0e7490` - Used for Chart Headers, Table Headers
- Primary Light: `#06b6d4`

**Status Colors:**
- Success: `#059669`
- Warning: `#d97706`
- Error: `#dc2626`

**Borders:**
- Border: `#e2e8f0`
- Border Light: `#cbd5e1`

---

## Layout Patterns

### Dashboard Layout (Fleet & Unit Views)
The standard layout for telematics data uses a 2-column grid:
- **Left Column (Charts):** Stacked Line Charts showing trends (MPG, Idle %, Miles).
- **Right Column (Tables):** Detailed breakdown tables with sticky headers.

```css
display: grid
grid-template-columns: 1fr 1fr
gap: 2rem
```

### Navigation Bar
- Background: `var(--bg-secondary)`
- Padding: `0.5rem 2rem`
- Flex: space-between
- Border bottom: 1px solid `var(--border)`
- **Logo Container:** White background, rounded corners (`0.5rem`), padding (`0.125rem 0.5rem`). Contains both Kerry Leasing and Kerry Brothers logos side-by-side.

### Page Header
- **Title:** Large, bold (`2rem`).
- **Controls:** Located on the right side.
  - **Telematics Controls (Telematics tab only):**
    - **View Mode Toggle:** "Unit | Driver" switch (controls telematics context).
    - **Date Range Picker:** Filters telematics charts + tables on the page.
  - **Repairs Controls (Repair Data tab only):**
    - **View Mode Toggle:** "Fleet | Unit" switch (controls repair context).
    - **Date Range Picker:** Filters repair invoices shown (client-side filter of preloaded contract range).

**Consistency Rule (Fleet vs Admin):**
- The **Fleet** and **Admin** overview pages MUST share the same header + tab layout:
  - Title/subtitle on the left
  - Contextual controls on the right (based on active tab)
  - Tabs directly under the header
- The **Admin** view may show additional columns/metrics (e.g. dollar totals, tax, export actions), but it should not introduce a different layout pattern.

---

## Data Visualization (Recharts)

### Charts
- **Type:** Line Charts (Stacked vertically in left column).
- **Line Color:** Amber/Gold (`#f59e0b`).
- **Stroke Width:** 4px.
- **Dot Style:** Filled circle (`r: 6`).
- **Grid:** Dashed, horizontal only (`strokeDasharray="3 3"`).

### Chart Headers
- **Style:** "Bar" style header above the chart container.
- **Background:** `var(--primary-dark)` (Navy/Teal depending on theme).
- **Text:** White, Uppercase, Bold (`1.25rem`).
- **Alignment:** Centered text.

### Interactive Filtering
- Clicking a row in the "Breakdown" table filters the charts on the left to show data for that specific Unit or Driver.
- "Clear Selection" option appears above charts when filtered.

---

## Repair Data (Invoices)

### Data Shape & Drilldown
Repair data is presented at the **invoice number** level and supports drilldown:
- **Fleet mode (Repairs toggle = Fleet):**
  - Single list of invoices across all units
  - Sorted by invoice date (desc)
  - Columns: Date, Unit, Invoice #, RO #, Total, Service Lines (expand to unique lines)
- **Unit mode (Repairs toggle = Unit):**
  - Unit search input
  - Grouped by Unit → invoices → service lines (expand)

### Design Rules
- **Same typography + table styling** as telematics tables:
  - Sticky header using `var(--primary-dark)` and white text
  - Scroll container using `.table-container`
- **Fleet vs Admin**
  - Fleet view should be minimal and “scan-friendly”
  - Admin view can add financial columns (e.g. subtotal, tax, totals), export buttons, and additional drilldown metadata, while keeping the same layout pattern.

---

## Loading States

### Skeletons
Use skeleton shimmer placeholders (not spinners) for initial loads and tab switches:
- Skeleton blocks must match the approximate size of the final UI (header bars, tables, chart panels).
- Do not render Recharts components until data exists to avoid `ResponsiveContainer` size warnings.

---

## Component Styles

### Tables
- **Container:** Border radius `0.75rem`, border `1px solid var(--border)`.
- **Standardization:** All tables must use the `.table` class for consistency.
- **Headers (thead):**
  - Background: `var(--primary-dark)` (Matches Chart Headers).
  - Text: White, Uppercase, Bold (`text-sm`).
  - Sticky position (`top: 0`).
  - Padding: `0.75rem` (12px).
- **Cells (td):**
  - Padding: `0.75rem` (12px).
  - Font Size: `text-sm` (14px).
  - Border Top: `1px solid var(--border)`.
- **Rows:** Hover effect (`var(--bg-hover)`).
- **Totals Row:** Always visible at bottom, distinct background (`var(--primary-dark)`), white text.

### Toggle Switches
- **Location:** Page Header (Global Context).
- **Style:**
  - Container: `var(--bg-tertiary)` or embedded in header bar.
  - Active State: `var(--primary)` background, White text.
  - Inactive State: Transparent background, `var(--text-secondary)` text.

### KPI Cards (Overview)
- **Grid:** 3 or 4 columns.
- **Content:** Label (uppercase), Value (large bold), Change indicator (optional).
- **Variant:** `primary` (standard).

---

## Typography
- **Font Family:** System fonts (`-apple-system`, `BlinkMacSystemFont`, etc.)
- **Page Title:** `2rem` (32px), weight 700.
- **Section Title:** `1.5rem` (24px), weight 600.
- **Table/Chart Headers:** Uppercase, letter-spacing `0.05em`.

---

## Interactive States
- **Hover:**
  - Cards: Border color to primary, lift 2px.
  - Buttons: Darker background.
  - Table Rows: Background change.
- **Selection:**
  - Table Rows: Highlighted background + Left border accent (`var(--primary)`).

---

## Best Practices
1.  **No Emojis:** Use SVG icons or text labels.
2.  **Theme Consistency:** Always use `var(--color-name)`. Never hardcode colors (except chart line colors which are passed as props, but should match theme palette).
3.  **Data Safety:** Show "No data available" states clearly with neutral icons.
4.  **Formatting:**
    - Miles: `toLocaleString()`
    - Decimals: Fixed to 2 places (`.toFixed(2)`).
