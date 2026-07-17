import { describe, expect, it } from "vitest";
import {
  buildChallengeRulesSummary,
  formatProvider,
  renderPropFirmNotificationEmail,
  renderTraderCredentialsEmail,
  resolveProviderFromAccount,
} from "@/lib/email/templates";
import type {
  ChallengeConfigInput,
  PropFirmAccountRecord,
  TraderLoginCredentials,
} from "@/types/provisioning";

const challengeConfig: ChallengeConfigInput = {
  profitTarget: 10,
  dailyDrawdown: 5,
  maxDrawdown: 10,
  maxBetSizeValue: 2,
  maxBetSizeMode: "percent",
  consistencyScore: 40,
  otherCustomRules: {
    minTradingDays: 5,
    challengeDurationDays: 30,
    profitSplitPct: 80,
    drawdownMode: "trailing",
  },
};

function makeAccount(
  overrides: Partial<PropFirmAccountRecord> = {},
): PropFirmAccountRecord {
  return {
    id: "acc_123",
    propFirmId: "firm_1",
    traderEmail: "alex@example.com",
    modelType: "1step",
    accountSize: "50K",
    status: "provisioned",
    purchasedAt: new Date("2026-01-01").toISOString(),
    credentialsSentAt: null,
    createdAt: new Date("2026-01-01").toISOString(),
    updatedAt: new Date("2026-01-01").toISOString(),
    challengeConfig: {
      id: "cfg_1",
      propFirmAccountId: "acc_123",
      profitTarget: 10,
      dailyDrawdown: 5,
      maxDrawdown: 10,
      maxBetSizeValue: 2,
      maxBetSizeMode: "percent",
      consistencyScore: 40,
      otherCustomRules: { provider: "kalshi" },
      createdAt: new Date("2026-01-01").toISOString(),
      updatedAt: new Date("2026-01-01").toISOString(),
    },
    traderDemoAccount: null,
    ...overrides,
  };
}

describe("email templates — Issue Account welcome", () => {
  it("formats known providers for the email body", () => {
    expect(formatProvider("kalshi")).toBe("Kalshi");
    expect(formatProvider("polymarket")).toBe("Polymarket");
    expect(formatProvider("CUSTOM")).toBe("CUSTOM");
    expect(formatProvider(null)).toBe("Internal LMSR");
  });

  it("resolves provider from challenge otherCustomRules", () => {
    expect(resolveProviderFromAccount(makeAccount())).toBe("kalshi");
    expect(
      resolveProviderFromAccount(
        makeAccount({
          challengeConfig: {
            id: "cfg_1",
            propFirmAccountId: "acc_123",
            profitTarget: 10,
            dailyDrawdown: 5,
            maxDrawdown: 10,
            maxBetSizeValue: 2,
            maxBetSizeMode: "percent",
            consistencyScore: null,
            otherCustomRules: {},
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        }),
        "polymarket",
      ),
    ).toBe("polymarket");
  });

  it("summarizes challenge rules for the trader email", () => {
    const lines = buildChallengeRulesSummary(challengeConfig);
    expect(lines).toEqual(
      expect.arrayContaining([
        "Profit target: 10%",
        "Daily drawdown limit: 5%",
        "Max drawdown: 10%",
        "Max bet per pick: 2% of balance",
        "Consistency score target: 40%",
        "Drawdown mode: trailing",
        "Minimum trading days: 5",
        "Challenge duration: 30 days",
        "Profit split: 80%",
      ]),
    );
  });

  it("includes account details, credentials, rules, and dashboard CTA", () => {
    const credentials: TraderLoginCredentials & { magicLink?: string } = {
      username: "alex@example.com",
      password: "TempPass123!",
      loginUrl: "https://app.example.com/login?tenant=apex",
    };

    const { subject, text, html } = renderTraderCredentialsEmail({
      account: makeAccount({ modelType: "1step", accountSize: "50K" }),
      credentials,
      context: {
        firmName: "Apex Prop",
        supportContact: "support@apex.example",
        appUrl: "https://app.example.com",
        dashboardUrl: "https://app.example.com/dashboard?tenant=apex",
        virtualBalance: 50_000,
        challengeConfig,
        provider: "kalshi",
        tenantSlug: "apex",
      },
    });

    expect(subject).toContain("Apex Prop");
    expect(subject).toContain("evaluation account is ready");

    expect(text).toContain("Model type:");
    expect(text).toContain("Account size: 50K");
    expect(text).toContain("Provider: Kalshi");
    expect(text).toContain("Username: alex@example.com");
    expect(text).toContain("Password: TempPass123!");
    expect(text).toContain("Challenge rules:");
    expect(text).toContain("Profit target: 10%");
    expect(text).toContain("Trader Dashboard:");
    expect(text).toContain("https://app.example.com/dashboard?tenant=apex");

    expect(html).toContain("Model type");
    expect(html).toContain("$50,000");
    expect(html).toContain("Kalshi");
    expect(html).toContain("Open Trader Dashboard");
    expect(html).toContain("https://app.example.com/dashboard?tenant=apex");
    expect(html).toContain("TempPass123!");
  });

  it("uses magic link when provided", () => {
    const { text, html } = renderTraderCredentialsEmail({
      account: makeAccount(),
      credentials: {
        username: "alex@example.com",
        password: "",
        magicLink: "https://app.example.com/login?token=abc&tenant=apex",
      },
      context: {
        firmName: "Apex Prop",
        supportContact: "support@apex.example",
        appUrl: "https://app.example.com",
        dashboardUrl: "https://app.example.com/dashboard?tenant=apex",
        virtualBalance: 25_000,
        challengeConfig,
        provider: "kalshi",
        tenantSlug: "apex",
      },
    });

    expect(text).toContain("Magic link:");
    expect(text).toContain("https://app.example.com/login?token=abc&tenant=apex");
    expect(html).toContain("Log in with magic link");
    expect(html).toContain("https://app.example.com/login?token=abc&amp;tenant=apex");
  });

  it("notifies the firm with provider and rules summary", () => {
    const { subject, text, html } = renderPropFirmNotificationEmail({
      account: makeAccount({ modelType: "instant", accountSize: "25K" }),
      credentials: {
        username: "alex@example.com",
        password: "secret",
      },
      context: {
        firmName: "Apex Prop",
        supportContact: "support@apex.example",
        appUrl: "https://app.example.com",
        dashboardUrl: "https://app.example.com/dashboard?tenant=apex",
        virtualBalance: 25_000,
        challengeConfig,
        provider: "polymarket",
        tenantSlug: "apex",
      },
      recipientEmail: "admin@apex.example",
    });

    expect(subject).toContain("alex@example.com");
    expect(text).toContain("Provider: Polymarket");
    expect(text).toContain("Model type: Instant Funding");
    expect(html).toContain("Polymarket");
    expect(html).toContain("Challenge rules applied");
    expect(html).toContain("Trader Dashboard");
  });
});
