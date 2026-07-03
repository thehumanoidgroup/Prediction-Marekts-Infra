/**
 * White-label tenant registry (fallback when the backend is unavailable).
 *
 * In production the database is the source of truth — see
 * `GET /api/v1/tenants/current` and `src/lib/tenant-server.ts`.
 * This registry provides stable client ids, slug aliases, and offline defaults.
 */

export type DrawdownMode = "static" | "trailing" | "absolute";

export interface TenantBranding {
  /** Primary accent, used for CTAs, active states, charts. */
  accent: string;
  /** Slightly darker accent for hover states. */
  accentHover: string;
  /** Accent color at low opacity backgrounds (chips, glows). */
  accentSoft: string;
  /** Foreground color rendered on top of the accent. */
  accentForeground: string;
  /** Single glyph / short mark rendered in the logo tile. */
  logoGlyph: string;
  /** Optional uploaded logo (data URL in the demo, CDN URL in prod). */
  logoUrl?: string;
}

export interface TenantProgram {
  currency: string;
  accountSizes: number[];
  profitTargetPct: number;
  maxDailyLossPct: number;
  maxDrawdownPct: number;
  /** Which drawdown floor policy applies (mirrors the risk engine). */
  drawdownMode: DrawdownMode;
  profitSplitPct: number;
  /** Max stake on a single pick (order), USD. */
  maxStakePerOrder: number;
  /** Max total cost basis at risk in one market, USD. */
  maxExposurePerMarket: number;
  /** Challenge time limit in days. */
  challengeDurationDays: number;
  minTradingDays: number;
}

export interface TenantConfig {
  id: string;
  /** Subdomain that maps to this tenant, e.g. `apex` → apex.proppredict.com */
  slug: string;
  name: string;
  tagline: string;
  branding: TenantBranding;
  /** Feature flags a firm can toggle for its traders. */
  features: {
    leaderboard: boolean;
    journal: boolean;
    payouts: boolean;
  };
  /** Challenge program defaults shown across the product. */
  program: TenantProgram;
}

export const DEFAULT_TENANT_ID = "proppredict";

const tenants: Record<string, TenantConfig> = {
  proppredict: {
    id: "proppredict",
    slug: "app",
    name: "PropPredict",
    tagline: "Trade predictions. Get funded.",
    branding: {
      accent: "#22c55e",
      accentHover: "#16a34a",
      accentSoft: "rgba(34, 197, 94, 0.12)",
      accentForeground: "#04170b",
      logoGlyph: "P",
    },
    features: { leaderboard: true, journal: true, payouts: true },
    program: {
      currency: "USD",
      accountSizes: [10_000, 25_000, 50_000, 100_000],
      profitTargetPct: 10,
      maxDailyLossPct: 5,
      maxDrawdownPct: 10,
      drawdownMode: "static",
      profitSplitPct: 80,
      maxStakePerOrder: 2_500,
      maxExposurePerMarket: 5_000,
      challengeDurationDays: 60,
      minTradingDays: 10,
    },
  },
  apex: {
    id: "apex",
    slug: "apex",
    name: "Apex Forecast",
    tagline: "Elite forecasting capital.",
    branding: {
      accent: "#38bdf8",
      accentHover: "#0ea5e9",
      accentSoft: "rgba(56, 189, 248, 0.12)",
      accentForeground: "#04121b",
      logoGlyph: "A",
    },
    features: { leaderboard: true, journal: true, payouts: false },
    program: {
      currency: "USD",
      accountSizes: [25_000, 50_000, 200_000],
      profitTargetPct: 8,
      maxDailyLossPct: 4,
      maxDrawdownPct: 8,
      drawdownMode: "trailing",
      profitSplitPct: 90,
      maxStakePerOrder: 5_000,
      maxExposurePerMarket: 10_000,
      challengeDurationDays: 45,
      minTradingDays: 7,
    },
  },
  nova: {
    id: "nova",
    slug: "nova",
    name: "Nova Markets",
    tagline: "Predict boldly. Trade funded.",
    branding: {
      accent: "#a78bfa",
      accentHover: "#8b5cf6",
      accentSoft: "rgba(167, 139, 250, 0.12)",
      accentForeground: "#120a24",
      logoGlyph: "N",
    },
    features: { leaderboard: true, journal: false, payouts: true },
    program: {
      currency: "USD",
      accountSizes: [10_000, 50_000, 100_000],
      profitTargetPct: 12,
      maxDailyLossPct: 5,
      maxDrawdownPct: 12,
      drawdownMode: "static",
      profitSplitPct: 75,
      maxStakePerOrder: 2_000,
      maxExposurePerMarket: 4_000,
      challengeDurationDays: 90,
      minTradingDays: 12,
    },
  },
};

export function getTenant(id: string | null | undefined): TenantConfig {
  if (id && tenants[id]) return tenants[id];
  return tenants[DEFAULT_TENANT_ID];
}

export function getTenantBySlug(slug: string): TenantConfig | null {
  return Object.values(tenants).find((t) => t.slug === slug) ?? null;
}

export function listTenants(): TenantConfig[] {
  return Object.values(tenants);
}
