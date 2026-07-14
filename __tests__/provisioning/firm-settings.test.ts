import { describe, expect, it } from "vitest";
import {
  filterAllowedPurchaseOverrides,
  validateProvisioningAgainstSettings,
} from "@/lib/provisioning/firm-settings";
import type { PropFirmSettingsRecord } from "@/types/firm-settings";

const baseSettings: PropFirmSettingsRecord = {
  id: "settings-1",
  tenantId: "firm-1",
  allowedModelTypes: ["2step", "instant"],
  allowedAccountSizes: ["50K", "100K"],
  modelDefaults: {
    "2step": { profitTarget: 8 },
  },
  allowedOverrideFields: ["profitTarget", "minTradingDays"],
  defaultCustomRules: {},
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("firm settings validation", () => {
  it("allows permitted model and size", () => {
    expect(() =>
      validateProvisioningAgainstSettings(baseSettings, "2step", "100K"),
    ).not.toThrow();
  });

  it("rejects disallowed model type with friendly error", () => {
    expect(() =>
      validateProvisioningAgainstSettings(baseSettings, "1step", "100K"),
    ).toThrow(/not enabled/);
  });

  it("filters custom rules to allowed override fields", () => {
    const filtered = filterAllowedPurchaseOverrides(baseSettings, {
      profitTarget: 9,
      maxDrawdown: 12,
      minTradingDays: 4,
    });
    expect(filtered).toEqual({ profitTarget: 9, minTradingDays: 4 });
  });
});
