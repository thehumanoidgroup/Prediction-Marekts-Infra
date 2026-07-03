import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { createPropFirmApiKey } from "@/lib/provisioning/api-keys";
import { ensureFirmSettingsSeeded } from "@/lib/provisioning/firm-settings";

const DEMO_PASSWORD = "demo-password-123";

const SEED_TENANTS = [
  {
    slug: "app",
    clientKey: "proppredict",
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
  {
    slug: "apex",
    clientKey: "apex",
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
  {
    slug: "nova",
    clientKey: "nova",
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
      drawdownMode: "absolute",
      profitSplitPct: 85,
      maxStakePerOrder: 3_000,
      maxExposurePerMarket: 6_000,
      challengeDurationDays: 30,
      minTradingDays: 5,
    },
  },
] as const;

let seeded = false;

async function ensureWebhookApiKeys(): Promise<void> {
  const tenants = await prisma.tenant.findMany({ select: { id: true, slug: true } });
  for (const tenant of tenants) {
    const count = await prisma.propFirmApiKey.count({ where: { tenantId: tenant.id } });
    if (count > 0) continue;

    const key = await createPropFirmApiKey(tenant.id, "webhook");
    if (process.env.NODE_ENV !== "production") {
      console.info(`[seed] Webhook API key for ${tenant.slug}: ${key.rawKey}`);
    }
  }
}

export async function ensureSeeded(): Promise<void> {
  if (seeded) {
    if (process.env.DATABASE_URL) {
      await ensureWebhookApiKeys();
      await ensureFirmSettingsSeeded();
    }
    return;
  }
  if (!process.env.DATABASE_URL) return;

  try {
    const count = await prisma.tenant.count();
    if (count > 0) {
      seeded = true;
      await ensureWebhookApiKeys();
      await ensureFirmSettingsSeeded();
      return;
    }

    const passwordHash = await hashPassword(DEMO_PASSWORD);

    for (const tenant of SEED_TENANTS) {
      const row = await prisma.tenant.create({
        data: {
          slug: tenant.slug,
          clientKey: tenant.clientKey,
          name: tenant.name,
          tagline: tenant.tagline,
          branding: tenant.branding,
          features: tenant.features,
          program: tenant.program,
        },
      });

      await prisma.user.createMany({
        data: [
          {
            tenantId: row.id,
            email: `trader@${tenant.slug}.demo`,
            displayName: "Demo Trader",
            hashedPassword: passwordHash,
            role: "trader",
          },
          {
            tenantId: row.id,
            email: `admin@${tenant.slug}.demo`,
            displayName: "Firm Admin",
            hashedPassword: passwordHash,
            role: "prop_firm_admin",
          },
        ],
      });
    }

    await prisma.user.create({
      data: {
        tenantId: null,
        email: "super@proppredict.demo",
        displayName: "Super Admin",
        hashedPassword: passwordHash,
        role: "super_admin",
      },
    });

    seeded = true;
    await ensureWebhookApiKeys();
    await ensureFirmSettingsSeeded();
  } catch (error) {
    console.error("[seed] failed:", error);
  }
}
