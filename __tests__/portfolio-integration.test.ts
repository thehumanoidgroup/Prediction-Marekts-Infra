import { describe, expect, it } from "vitest";
import { inferMarketSource, placeOrder, getPortfolioSummary, getPositions } from "@/lib/services";
import { getTenantState } from "@/lib/store";

describe("multi-provider portfolio integration", () => {
  it("infers provider from market id prefixes", () => {
    expect(inferMarketSource("mkt-1")).toBe("internal");
    expect(inferMarketSource("kalshi-KXBTCD")).toBe("kalshi");
    expect(inferMarketSource("poly-abc123")).toBe("polymarket");
    expect(inferMarketSource("0xdeadbeef")).toBe("polymarket");
    expect(inferMarketSource("sp500-AAPL-0dte")).toBe("sp500_dynamic");
  });

  it("recomputes equity and totalPnl after an internal fill", () => {
    const tenantId = "apex";
    const before = getTenantState(tenantId).account;
    const startingEquity = before.equity;

    placeOrder(tenantId, {
      marketId: "mkt-1",
      outcome: "yes",
      side: "buy",
      shares: 10,
    });

    const summary = getPortfolioSummary(tenantId);
    const positions = getPositions(tenantId);
    expect(positions.some((p) => p.marketId === "mkt-1")).toBe(true);
    expect(summary.equity).toBeCloseTo(summary.balance + summary.openPnl, 1);
    expect(summary.totalPnl).toBeCloseTo(summary.equity - before.startingBalance, 1);
    // Equity should remain finite and challenge objectives rebuilt.
    expect(Number.isFinite(summary.equity)).toBe(true);
    expect(getTenantState(tenantId).account.objectives.length).toBeGreaterThan(0);
    expect(summary.equity).not.toBe(startingEquity - 1_000_000);
  });

  it("tags external market source on synthetic positions", () => {
    const tenantId = "apex";
    placeOrder(tenantId, {
      marketId: "kalshi-TESTTICKER",
      outcome: "yes",
      side: "buy",
      shares: 5,
      market: {
        id: "kalshi-TESTTICKER",
        question: "Kalshi test market",
        category: "economics",
        status: "open",
        yesPrice: 0.5,
        change24h: 0,
        volume: 0,
        volume24h: 0,
        openInterest: 0,
        traders: 0,
        closesAt: Date.now() + 86_400_000,
        history: [],
        source: "kalshi",
      },
    });

    const positions = getPositions(tenantId);
    const kalshi = positions.find((p) => p.marketId === "kalshi-TESTTICKER");
    expect(kalshi?.market.source).toBe("kalshi");
  });
});
