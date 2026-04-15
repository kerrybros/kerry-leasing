/**
 * Recharts color palette using CSS variables.
 * All colors are defined as HSL values matching the shadcn/ui CSS variable system.
 *
 * Usage in Recharts: pass these as style/stroke/fill props directly.
 */
import type React from 'react';

export const CHART_COLORS = {
  // Semantic colors
  danger: 'var(--destructive)',
  warning: '#d9a528',
  success: '#22c55e',
  /** Brand primary — use for main series (lines, standard repair bars); follows OrgBrandTheme. */
  primary: 'var(--primary)',
  muted: 'var(--muted-foreground)',

  // Chart-specific
  idle: '#d9a528',      // amber — idle/donut semantics where not using brand primary
  driving: '#22c55e',   // green — driving time/fuel
  damage: '#ef4444',    // red — damage events
  miles: 'var(--primary)',

  // Grid / axes
  grid: 'var(--border)',
  axis: 'var(--muted-foreground)',
  // Use full foreground for data labels so they're legible in both light and dark mode
  tick: 'var(--foreground)',
} as const;

/**
 * Recharts tooltip contentStyle.
 * Uses CSS system colors (Canvas/CanvasText) which reliably resolve in both
 * light and dark mode without CSS custom property inheritance issues inside Recharts.
 */
export const TOOLTIP_STYLE: React.CSSProperties = {
  backgroundColor: 'Canvas',
  border: '1px solid ButtonBorder',
  borderRadius: 5,
  color: 'CanvasText',
  boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
  fontSize: 10,
  padding: '4px 8px',
  lineHeight: 1.5,
};

/** Legend text style */
export const LEGEND_STYLE: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--muted-foreground)',
};
