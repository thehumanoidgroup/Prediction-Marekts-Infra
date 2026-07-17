import { describe, expect, it } from "vitest";
import {
  buildChallengeWarnings,
  dailyLossUsagePct,
  drawdownBufferUsd,
} from "@/lib/challenge-warnings";
import type { ChallengeAccount } from "@/lib/types";

function makeAccount(overrides: Partial<ChallengeAccount> = {}): ChallengeAccount {
  const startingBalance = 25_000;
  return {
    id: "acct-1",
    label: "25K Evaluation",
    phase: "evaluation",
    startingBalance,
    balance: 24_000,
    equity: 24_000,
    dailyPnl: -200,
    totalPnl: -1_000,
    maxDailyLossPct: 5,
    maxDrawdownPct: 10,
    profitTargetPct: 10,
    daysTraded: 5,
    minTradingDays: 10,
    startedAt: Date.now() - 5 * 86_400_000,
    highWaterMark: startingBalance,
    drawdownFloor: startingBalance * 0.9,
    objectives: [
      {
        id: "profit-target",
        label: "Profit target",
        current: 0,
        target: 2_500,
        inverted: false,
        unit: "usd",
        met: false,
      },
      {
        id: "daily-loss",
        label: "Max daily loss",
        current: 200,
        target: 1_250,
        inverted: true,
        unit: "usd",
        met: true,
      },
      {
        id: "max-drawdown",
        label: "Max drawdown",
        current: 1_000,
        target: 2_500,
        inverted: true,
        unit: "usd",
        met: true,
      },
      {
        id: "trading-days",
        label: "Min trading days",
        current: 5,
        target: 10,
        inverted: false,
        unit: "days",
        met: false,
      },
    ],
    equityCurve: [],
    ...overrides,
  };
}

describe("challenge warnings", () => {
  it("computes drawdown buffer from equity and floor", () => {
    const account = makeAccount({ equity: 23_000 });
    const { buffer, bufferPct, floor } = drawdownBufferUsd(account);
    expect(floor).toBe(22_500);
    expect(buffer).toBe(500);
    expect(bufferPct).toBeCloseTo(20, 0);
  });

  it("warns when near max drawdown", () => {
    const account = makeAccount({ equity: 22_700 }); // ~8% of $2500 buffer left
    const warnings = buildChallengeWarnings(account);
    expect(warnings.some((w) => w.id === "drawdown-critical")).toBe(true);
  });

  it("warns when approaching daily loss limit", () => {
    const account = makeAccount({ dailyPnl: -1_000 }); // 80% of $1250
    const { usagePct } = dailyLossUsagePct(account);
    expect(usagePct).toBeCloseTo(80, 0);
    const warnings = buildChallengeWarnings(account);
    expect(warnings.some((w) => w.id === "daily-loss-caution")).toBe(true);
  });

  it("returns failed status as a hard stop warning", () => {
    const warnings = buildChallengeWarnings(makeAccount({ challengeStatus: "failed" }));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.id).toBe("challenge-failed");
  });

  it("returns no warnings for a healthy account", () => {
    const warnings = buildChallengeWarnings(
      makeAccount({ equity: 25_500, dailyPnl: 100, totalPnl: 500 }),
    );
    expect(warnings.filter((w) => w.tone === "warn" || w.tone === "down")).toHaveLength(0);
  });
});
