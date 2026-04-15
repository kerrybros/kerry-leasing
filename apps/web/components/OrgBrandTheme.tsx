'use client';

import { useEffect, useRef } from 'react';
import { useOrgSettingsQuery } from '@/hooks/useDataQueries';
import { BRAND_PRESET_MAP } from '@/lib/brandPresets';

const CSS_VARS = ['--primary', '--primary-foreground', '--primary-dark', '--primary-light', '--ring'] as const;

/**
 * Applies per-org brand color overrides as inline CSS custom properties on
 * <html>. Reacts to org switch (query key includes orgId), dark/light toggle
 * (MutationObserver on the class list), and preset changes after admin save.
 *
 * null / KERRY_GOLD → clears overrides so globals.css defaults apply.
 */
export function OrgBrandTheme() {
  const { data: orgSettings } = useOrgSettingsQuery();
  const observerRef = useRef<MutationObserver | null>(null);

  useEffect(() => {
    function apply() {
      const preset = orgSettings?.brandColorPreset;
      const config = preset ? BRAND_PRESET_MAP[preset] : null;
      const el = document.documentElement;

      if (!config || config.key === 'KERRY_GOLD') {
        CSS_VARS.forEach((v) => el.style.removeProperty(v));
        return;
      }

      const isDark = el.classList.contains('dark');
      const bundle = isDark ? config.dark : config.light;
      (Object.entries(bundle) as [string, string][]).forEach(([k, v]) => {
        el.style.setProperty(k, v);
      });
    }

    apply();

    observerRef.current?.disconnect();
    const observer = new MutationObserver(apply);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
    observerRef.current = observer;

    return () => observer.disconnect();
  }, [orgSettings?.brandColorPreset]);

  return null;
}
