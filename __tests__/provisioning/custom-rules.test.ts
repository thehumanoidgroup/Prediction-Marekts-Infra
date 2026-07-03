import { describe, expect, it } from "vitest";
import { customRulesSchema } from "@/lib/schemas/custom-rules";

describe("customRulesSchema", () => {
  it("accepts valid flat overrides", () => {
    const result = customRulesSchema.parse({
      profitTarget: 9,
      minTradingDays: 5,
    });
    expect(result).toEqual({ profitTarget: 9, minTradingDays: 5 });
  });

  it("rejects unknown keys", () => {
    expect(() =>
      customRulesSchema.parse({ unknownField: 1 }),
    ).toThrow(/Unknown custom_rules field/);
  });

  it("rejects nested objects", () => {
    expect(() =>
      customRulesSchema.parse({ profitTarget: { nested: true } }),
    ).toThrow();
  });

  it("rejects percent max bet above 100", () => {
    expect(() =>
      customRulesSchema.parse({
        maxBetSizeMode: "percent",
        maxBetSizeValue: 150,
      }),
    ).toThrow(/cannot exceed 100/);
  });
});
