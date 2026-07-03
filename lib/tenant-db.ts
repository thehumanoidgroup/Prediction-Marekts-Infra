import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { TenantConfig } from "@/lib/tenants";
import type { TenantOverrides } from "@/lib/store";

type BrandingJson = {
  accent?: string;
  accent_hover?: string;
  accentHover?: string;
  accent_soft?: string;
  accentSoft?: string;
  accent_foreground?: string;
  accentForeground?: string;
  logo_glyph?: string;
  logoGlyph?: string;
  logo_url?: string;
  logoUrl?: string;
};

type ProgramJson = {
  currency?: string;
  account_sizes?: number[];
  accountSizes?: number[];
  profit_target_pct?: number;
  profitTargetPct?: number;
  max_daily_loss_pct?: number;
  maxDailyLossPct?: number;
  max_drawdown_pct?: number;
  maxDrawdownPct?: number;
  drawdown_mode?: string;
  drawdownMode?: string;
  profit_split_pct?: number;
  profitSplitPct?: number;
  max_stake_per_order?: number;
  maxStakePerOrder?: number;
  max_exposure_per_market?: number;
  maxExposurePerMarket?: number;
  challenge_duration_days?: number;
  challengeDurationDays?: number;
  min_trading_days?: number;
  minTradingDays?: number;
};

function mapBranding(raw: BrandingJson): TenantConfig["branding"] {
  return {
    accent: raw.accent ?? "#22c55e",
    accentHover: raw.accentHover ?? raw.accent_hover ?? "#16a34a",
    accentSoft: raw.accentSoft ?? raw.accent_soft ?? "rgba(34, 197, 94, 0.12)",
    accentForeground: raw.accentForeground ?? raw.accent_foreground ?? "#04170b",
    logoGlyph: raw.logoGlyph ?? raw.logo_glyph ?? "P",
    logoUrl: raw.logoUrl ?? raw.logo_url,
  };
}

function mapProgram(raw: ProgramJson): TenantConfig["program"] {
  return {
    currency: raw.currency ?? "USD",
    accountSizes: raw.accountSizes ?? raw.account_sizes ?? [10_000, 25_000, 50_000, 100_000],
    profitTargetPct: raw.profitTargetPct ?? raw.profit_target_pct ?? 10,
    maxDailyLossPct: raw.maxDailyLossPct ?? raw.max_daily_loss_pct ?? 5,
    maxDrawdownPct: raw.maxDrawdownPct ?? raw.max_drawdown_pct ?? 10,
    drawdownMode: (raw.drawdownMode ?? raw.drawdown_mode ?? "static") as TenantConfig["program"]["drawdownMode"],
    profitSplitPct: raw.profitSplitPct ?? raw.profit_split_pct ?? 80,
    maxStakePerOrder: raw.maxStakePerOrder ?? raw.max_stake_per_order ?? 2_500,
    maxExposurePerMarket: raw.maxExposurePerMarket ?? raw.max_exposure_per_market ?? 5_000,
    challengeDurationDays: raw.challengeDurationDays ?? raw.challenge_duration_days ?? 60,
    minTradingDays: raw.minTradingDays ?? raw.min_trading_days ?? 10,
  };
}

export function tenantRowToConfig(row: {
  clientKey: string;
  slug: string;
  name: string;
  tagline: string;
  branding: Prisma.JsonValue;
  features: Prisma.JsonValue;
  program: Prisma.JsonValue;
}): TenantConfig {
  const features = (row.features ?? {}) as TenantConfig["features"];
  return {
    id: row.clientKey,
    slug: row.slug,
    name: row.name,
    tagline: row.tagline,
    branding: mapBranding((row.branding ?? {}) as BrandingJson),
    features: {
      leaderboard: features.leaderboard ?? true,
      journal: features.journal ?? true,
      payouts: features.payouts ?? true,
    },
    program: mapProgram((row.program ?? {}) as ProgramJson),
  };
}

export async function getTenantConfigBySlug(slug: string): Promise<TenantConfig | null> {
  const row = await prisma.tenant.findFirst({
    where: { slug, isActive: true },
  });
  if (!row) return null;
  return tenantRowToConfig(row);
}

export async function patchTenantBySlug(
  slug: string,
  patch: TenantOverrides,
): Promise<TenantConfig | null> {
  const row = await prisma.tenant.findFirst({ where: { slug, isActive: true } });
  if (!row) return null;

  const current = tenantRowToConfig(row);
  const merged: TenantConfig = {
    ...current,
    name: patch.name ?? current.name,
    tagline: patch.tagline ?? current.tagline,
    branding: { ...current.branding, ...patch.branding },
    features: { ...current.features, ...patch.features },
    program: { ...current.program, ...patch.program },
  };

  const updated = await prisma.tenant.update({
    where: { id: row.id },
    data: {
      name: merged.name,
      tagline: merged.tagline,
      branding: merged.branding as unknown as Prisma.InputJsonValue,
      features: merged.features as unknown as Prisma.InputJsonValue,
      program: merged.program as unknown as Prisma.InputJsonValue,
    },
  });

  return tenantRowToConfig(updated);
}
