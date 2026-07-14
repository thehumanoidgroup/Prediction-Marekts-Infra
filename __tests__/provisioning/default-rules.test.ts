import { describe, expect, it } from "vitest";
import { resolveChallengeConfigForAccount } from "@/services/account-provisioning";
import type { PropFirmSettingsRecord } from "@/types/firm-settings";

const firmSettings: PropFirmSettingsRecord = {
  id: "settings-1",
  tenantId: "firm-1",
  allowedModelTypes: ["2step"],
  allowedAccountSizes: ["100K"],
  modelDefaults: {
    "2step": {
      profitTarget: 7,
      dailyDrawdown: 4,
      minTradingDays: 6,
    },
  },
  allowedOverrideFields: ["profitTarget"],
  defaultCustomRules: { profitSplitPct: 85 },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("resolveChallengeConfigForAccount", () => {
  it("merges firm defaults, purchase overrides, and program settings", () => {
    const config = resolveChallengeConfigForAccount({
      propFirmId: "firm-1",
      modelType: "2step",
      accountSize: "100K",
      firmProgram: { profitTargetPct: 10, maxDailyLossPct: 5, maxDrawdownPct: 10 },
      firmSettings,
      customRules: { profitTarget: 9, maxDrawdown: 99 },
    });

    expect(config.profitTarget).toBe(9);
    expect(config.dailyDrawdown).toBe(4);
    expect(config.otherCustomRules?.minTradingDays).toBe(6);
    expect(config.otherCustomRules?.profitSplitPct).toBe(85);
    expect(config.otherCustomRules?.maxDrawdown).toBeUndefined();
  });
});
