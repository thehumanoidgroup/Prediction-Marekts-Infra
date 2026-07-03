"use client";

import { useEffect, type ReactNode } from "react";
import type { TenantConfig } from "@/lib/tenants";

export const THEME_UPDATED_EVENT = "pp:theme-updated";

/** Applies tenant CSS variables to <html> for all dashboards (client navigations). */
export function TenantTheme({
  tenant,
  children,
}: {
  tenant: TenantConfig;
  children: ReactNode;
}) {
  useEffect(() => {
    function applyTheme(config: TenantConfig) {
      const root = document.documentElement;
      root.style.setProperty("--tenant-accent", config.branding.accent);
      root.style.setProperty("--tenant-accent-hover", config.branding.accentHover);
      root.style.setProperty("--tenant-accent-soft", config.branding.accentSoft);
      root.style.setProperty("--tenant-accent-foreground", config.branding.accentForeground);
    }

    applyTheme(tenant);

    const onUpdate = (event: Event) => {
      const detail = (event as CustomEvent<TenantConfig>).detail;
      if (detail) applyTheme(detail);
    };
    window.addEventListener(THEME_UPDATED_EVENT, onUpdate);
    return () => window.removeEventListener(THEME_UPDATED_EVENT, onUpdate);
  }, [tenant]);

  return children;
}

export function notifyThemeUpdated(tenant: TenantConfig) {
  window.dispatchEvent(new CustomEvent(THEME_UPDATED_EVENT, { detail: tenant }));
}
