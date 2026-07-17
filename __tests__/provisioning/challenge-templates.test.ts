/**
 * Challenge templates: validation, default-rule fallback, risk enforcement.
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  DRAWDOWN_ORDER_ERROR,
  challengeTemplateSaveSchema,
  validateDrawdownOrder,
} from "@/lib/schemas/challenge-template";
import { resolveDefaultChallengeConfig } from "@/lib/provisioning/default-rules";
import {
  buildRiskProfile,
  clearRiskProfilesForTests,
  registerRiskProfile,
  validateOrderRisk,
} from "@/lib/engine/risk";

describe("challenge template validation", () => {
  it("requires max drawdown greater than daily drawdown", () => {
    const bad = challengeTemplateSaveSchema.safeParse({
      profitTarget: 10,
      dailyDrawdown: 8,
      maxDrawdown: 5,
      maxBetSizePerPick: 2,
      maxBetSizeMode: "percent",
    });
    expect(bad.success).toBe(false);
    if (!bad.success) {
      expect(bad.error.issues.some((i) => i.message === DRAWDOWN_ORDER_ERROR)).toBe(true);
    }

    const good = challengeTemplateSaveSchema.safeParse({
      profitTarget: 10,
      dailyDrawdown: 4,
      maxDrawdown: 8,
      maxBetSizePerPick: 2,
      maxBetSizeMode: "percent",
    });
    expect(good.success).toBe(true);
    expect(validateDrawdownOrder(4, 8)).toBeNull();
    expect(validateDrawdownOrder(8, 5)).toBe(DRAWDOWN_ORDER_ERROR);
  });
});

describe("resolveDefaultChallengeConfig firm template fallback", () => {
  it("applies PropFirmChallengeTemplate after settings and before purchase overrides", () => {
    const config = resolveDefaultChallengeConfig({
      modelType: "1step",
      accountSize: "50K",
      firmProgram: { profitTargetPct: 10, maxDailyLossPct: 5, maxDrawdownPct: 10 },
      firmModelDefaults: { profitTarget: 9 },
      firmChallengeTemplate: {
        profitTarget: 11.5,
        dailyDrawdown: 4.25,
        maxDrawdown: 8.75,
        maxBetSizePerPick: 1500,
        maxBetSizeMode: "fixed",
        consistencyScore: 0.4,
        minTradingDays: 9,
        otherRules: {
          drawdown_mode: "trailing",
          profit_split_pct: 82,
          challenge_duration_days: 45,
          max_exposure_per_market: 3000,
        },
      },
      customRules: { profitTarget: 7 },
    });

    expect(config.profitTarget).toBe(7); // purchase wins
    expect(config.dailyDrawdown).toBe(4.25); // template
    expect(config.maxDrawdown).toBe(8.75);
    expect(config.maxBetSizeMode).toBe("fixed");
    expect(config.maxBetSizeValue).toBe(1500);
    expect(config.consistencyScore).toBe(0.4);
    expect(config.otherCustomRules?.minTradingDays).toBe(9);
    expect(config.otherCustomRules?.drawdownMode).toBe("trailing");
    expect(config.otherCustomRules?.profitSplitPct).toBe(82);
    expect(config.otherCustomRules?.challengeDurationDays).toBe(45);
    expect(config.otherCustomRules?.maxExposurePerMarket).toBe(3000);
  });

  it("uses different templates for 1step vs 2step", () => {
    const one = resolveDefaultChallengeConfig({
      modelType: "1step",
      accountSize: "25K",
      firmChallengeTemplate: {
        profitTarget: 12,
        dailyDrawdown: 5,
        maxDrawdown: 10,
        maxBetSizePerPick: 2,
        maxBetSizeMode: "percent",
      },
    });
    const two = resolveDefaultChallengeConfig({
      modelType: "2step",
      accountSize: "25K",
      firmChallengeTemplate: {
        profitTarget: 8,
        dailyDrawdown: 3,
        maxDrawdown: 7,
        maxBetSizePerPick: 800,
        maxBetSizeMode: "fixed",
      },
    });
    expect(one.profitTarget).toBe(12);
    expect(two.profitTarget).toBe(8);
    expect(two.maxBetSizeMode).toBe("fixed");
    expect(two.maxBetSizeValue).toBe(800);
  });
});

describe("risk engine enforces template bet limits", () => {
    beforeEach(() => {
      clearRiskProfilesForTests();
    });

  it("blocks oversized bets for fixed max-bet templates across providers", () => {
    for (const provider of ["kalshi", "sp500_dynamic", "polymarket", "internal"]) {
      const accountId = `acct-${provider}`;
      const profile = buildRiskProfile({
        propFirmAccountId: accountId,
        propFirmId: "firm-1",
        traderEmail: "trader@example.com",
        modelType: "2step",
        accountSize: "25K",
        virtualBalance: 25_000,
        challengeConfig: {
          profitTarget: 8,
          dailyDrawdown: 3,
          maxDrawdown: 7,
          maxBetSizeValue: 500,
          maxBetSizeMode: "fixed",
          consistencyScore: null,
          otherCustomRules: {
            provider,
            maxExposurePerMarket: 1_000,
            drawdownMode: "static",
            minTradingDays: 10,
            challengeDurationDays: 60,
          },
        },
      });
      registerRiskProfile(profile);

      const blocked = validateOrderRisk(accountId, {
        orderCostUsd: 750,
        marketExposureUsd: 750,
      });
      expect(blocked.allowed).toBe(false);
      expect(blocked.reason).toMatch(/max bet/i);

      const ok = validateOrderRisk(accountId, {
        orderCostUsd: 400,
        marketExposureUsd: 400,
      });
      expect(ok.allowed).toBe(true);
    }
  });
});
