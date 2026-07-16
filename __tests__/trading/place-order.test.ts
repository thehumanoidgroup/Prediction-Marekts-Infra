import { describe, expect, it } from "vitest";
import { getAccount, getJournal, getPositions, placeOrder } from "@/lib/services";
import type { Market } from "@/lib/types";

const tenantId = "test-trader-bets";

function polyMarket(overrides: Partial<Market> = {}): Market {
  return {
    id: "poly-0xtestcondition",
    question: "Will virtual Polymarket bets fill?",
    category: "crypto",
    status: "open",
    yesPrice: 0.4,
    change24h: 0.01,
    volume: 10_000,
    volume24h: 2_000,
    openInterest: 5_000,
    traders: 12,
    closesAt: Date.now() + 86_400_000,
    history: [],
    source: "polymarket",
    externalConditionId: "0xtestcondition",
    acceptingOrders: true,
    ...overrides,
  };
}

describe("placeOrder virtual external markets", () => {
  it("fills a Polymarket virtual buy and logs journal + position", () => {
    const before = getAccount(tenantId).balance;
    const result = placeOrder(tenantId, {
      marketId: "poly-0xtestcondition",
      outcome: "yes",
      side: "buy",
      shares: 100,
      market: polyMarket(),
      yesPrice: 0.4,
    });

    expect(result.order.shares).toBe(100);
    expect(result.order.price).toBeCloseTo(0.4);
    expect(result.position?.shares).toBe(100);
    expect(getAccount(tenantId).balance).toBeCloseTo(before - 40);

    const positions = getPositions(tenantId);
    expect(positions.some((p) => p.marketId === "poly-0xtestcondition")).toBe(true);

    const journal = getJournal(tenantId);
    expect(journal[0]?.kind).toBe("trade");
    expect(journal[0]?.marketId).toBe("poly-0xtestcondition");
    expect(journal[0]?.tags).toContain("polymarket");
  });

  it("fills a Kalshi virtual buy against live YES price", () => {
    const market: Market = {
      id: "kalshi-KXTEST-1",
      question: "Kalshi virtual market?",
      category: "economics",
      status: "open",
      yesPrice: 0.55,
      change24h: 0,
      volume: 1_000,
      volume24h: 100,
      openInterest: 200,
      traders: 3,
      closesAt: Date.now() + 86_400_000,
      history: [],
      source: "kalshi",
      acceptingOrders: true,
    };

    const result = placeOrder(tenantId, {
      marketId: market.id,
      outcome: "no",
      side: "buy",
      shares: 50,
      market,
      yesPrice: 0.55,
    });

    expect(result.order.outcome).toBe("no");
    expect(result.order.price).toBeCloseTo(0.45);
    expect(getPositions(tenantId).some((p) => p.marketId === market.id && p.outcome === "no")).toBe(
      true,
    );
  });
});
