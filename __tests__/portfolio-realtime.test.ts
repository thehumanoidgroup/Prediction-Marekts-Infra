import { describe, expect, it } from "vitest";
import type { EnrichedPosition } from "@/lib/services";
import {
  applyYesPriceToPositions,
  mergePortfolioPositions,
  summarizeOpenPnl,
} from "@/lib/portfolio-realtime";

function pos(partial: Partial<EnrichedPosition> & Pick<EnrichedPosition, "id" | "marketId">): EnrichedPosition {
  const shares = partial.shares ?? 100;
  const avgPrice = partial.avgPrice ?? 0.4;
  const currentPrice = partial.currentPrice ?? 0.5;
  const value = currentPrice * shares;
  const cost = avgPrice * shares;
  const pnl = value - cost;
  return {
    outcome: "yes",
    shares,
    avgPrice,
    openedAt: Date.now(),
    currentPrice,
    value,
    cost,
    pnl,
    pnlPct: cost > 0 ? (pnl / cost) * 100 : 0,
    market: {
      id: partial.marketId,
      question: "Q?",
      category: "stocks",
      status: "open",
      yesPrice: currentPrice,
      change24h: 0,
      volume: 0,
      volume24h: 0,
      openInterest: 0,
      traders: 0,
      closesAt: Date.now() + 86_400_000,
      history: [],
      source: "internal",
    },
    ...partial,
  };
}

describe("portfolio-realtime merge", () => {
  it("inserts new_position instantly", () => {
    const current = [pos({ id: "a", marketId: "m1" })];
    const incoming = pos({ id: "b", marketId: "m2", currentPrice: 0.6 });
    const next = mergePortfolioPositions(current, {
      type: "new_position",
      reason: "order_filled",
      position: incoming,
    });
    expect(next.map((p) => p.id)).toEqual(["b", "a"]);
  });

  it("updates an existing position in place", () => {
    const current = [pos({ id: "a", marketId: "m1", shares: 50 })];
    const next = mergePortfolioPositions(current, {
      type: "new_position",
      reason: "order_filled",
      position: pos({ id: "a", marketId: "m1", shares: 150 }),
    });
    expect(next).toHaveLength(1);
    expect(next[0].shares).toBe(150);
  });

  it("removes closed positions", () => {
    const current = [
      pos({ id: "a", marketId: "m1" }),
      pos({ id: "b", marketId: "m2" }),
    ];
    const next = mergePortfolioPositions(current, {
      type: "portfolio_update",
      reason: "position_closed",
      marketId: "m1",
      position: null,
    });
    expect(next.map((p) => p.id)).toEqual(["b"]);
  });

  it("applies live yes prices to open P&L", () => {
    const current = [pos({ id: "a", marketId: "m1", shares: 100, avgPrice: 0.4, currentPrice: 0.4 })];
    const marked = applyYesPriceToPositions(current, "m1", 0.7);
    expect(marked[0].currentPrice).toBeCloseTo(0.7);
    expect(marked[0].pnl).toBeCloseTo(30);
    expect(summarizeOpenPnl(marked)).toBeCloseTo(30);
  });
});
