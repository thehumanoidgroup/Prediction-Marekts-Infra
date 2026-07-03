import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";
import { TenantTheme } from "@/components/theme/tenant-theme";
import { getRequestTenant } from "@/lib/tenant-server";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await getRequestTenant();
  return {
    title: {
      default: `${tenant.name} — Prediction Markets`,
      template: `%s · ${tenant.name}`,
    },
    description: tenant.tagline,
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const tenant = await getRequestTenant();
  const brandVars = {
    "--tenant-accent": tenant.branding.accent,
    "--tenant-accent-hover": tenant.branding.accentHover,
    "--tenant-accent-soft": tenant.branding.accentSoft,
    "--tenant-accent-foreground": tenant.branding.accentForeground,
  } as CSSProperties;

  return (
    <html lang="en" style={brandVars}>
      <body className="min-h-screen">
        <TenantTheme tenant={tenant}>{children}</TenantTheme>
      </body>
    </html>
  );
}
