import { describe, expect, it } from "vitest";
import type { EnrichedPosition } from "@/lib/services";
import type { Market } from "@/lib/types";
import {
  filterOpenPositions,
  formatStrikeOutcome,
  markPosition,
  resolveExpirationType,
  summarizeLivePositions,
} from "@/lib/portfolio-positions";

function market(partial: Partial<Market> & Pick<Market, "id" | "question">): Market {
  return {
    category: "stocks",
    status: "open",
    yesPrice: 0.55,
    change24h: 0,
    volume: 0,
    volume24h: 0,
    openInterest: 0,
    traders: 0,
    closesAt: Date.now() + 3_600_000,
    history: [],
    source: "internal",
    ...partial,
  };
}

function position(
  overrides: Partial<EnrichedPosition> & Pick<EnrichedPosition, "id" | "market">,
): EnrichedPosition {
  const avgPrice = overrides.avgPrice ?? 0.4;
  const shares = overrides.shares ?? 100;
  const currentPrice = overrides.currentPrice ?? overrides.market.yesPrice;
  const value = currentPrice * shares;
  const cost = avgPrice * shares;
  const pnl = value - cost;
  return {
    marketId: overrides.market.id,
    outcome: "yes",
    shares,
    avgPrice,
    openedAt: Date.now(),
    currentPrice,
    value,
    cost,
    pnl,
    pnlPct: cost > 0 ? (pnl / cost) * 100 : 0,
    ...overrides,
  };
}

describe("portfolio-positions", () => {
  it("resolves explicit and inferred expiration types", () => {
    const now = Date.now();
    expect(resolveExpirationType({ expirationType: "0dte", closesAt: now + WEEK }, now)).toBe(
      "0dte",
    );
    expect(resolveExpirationType({ expirationType: "weekly", closesAt: now + HOUR }, now)).toBe(
      "weekly",
    );
    expect(resolveExpirationType({ closesAt: now + HOUR }, now)).toBe("0dte");
    expect(resolveExpirationType({ closesAt: now + 3 * DAY }, now)).toBe("weekly");
  });

  it("filters by tenor and provider", () => {
    const rows = [
      position({
        id: "p1",
        market: market({
          id: "m1",
          question: "SPX 0DTE",
          source: "sp500_dynamic",
          expirationType: "0dte",
          strikePrice: 5200,
          stockTicker: "SPY",
        }),
      }),
      position({
        id: "p2",
        market: market({
          id: "m2",
          question: "Kalshi weekly",
          source: "kalshi",
          closesAt: Date.now() + 3 * DAY,
        }),
      }),
      position({
        id: "p3",
        market: market({
          id: "m3",
          question: "Poly",
          source: "polymarket",
          closesAt: Date.now() + 30 * DAY,
        }),
      }),
    ];

    expect(filterOpenPositions(rows, { tenor: "0dte" }).map((p) => p.id)).toEqual(["p1"]);
    expect(filterOpenPositions(rows, { tenor: "weekly" }).map((p) => p.id)).toEqual(["p2"]);
    expect(filterOpenPositions(rows, { provider: "kalshi" }).map((p) => p.id)).toEqual(["p2"]);
    expect(filterOpenPositions(rows, { provider: "all", tenor: "all" })).toHaveLength(3);
  });

  it("marks positions with live prices and summarizes totals", () => {
    const row = position({
      id: "p1",
      shares: 100,
      avgPrice: 0.4,
      market: market({ id: "m1", question: "Will it rain?", yesPrice: 0.5 }),
    });
    const marked = markPosition(row, { m1: 0.7 });
    expect(marked.currentPrice).toBe(0.7);
    expect(marked.value).toBeCloseTo(70);
    expect(marked.pnl).toBeCloseTo(30);

    const totals = summarizeLivePositions([row], { m1: 0.7 });
    expect(totals.portfolioValue).toBeCloseTo(70);
    expect(totals.openPnl).toBeCloseTo(30);
    expect(totals.costBasis).toBeCloseTo(40);
  });

  it("formats strike/outcome labels", () => {
    expect(
      formatStrikeOutcome(
        position({
          id: "p1",
          outcome: "yes",
          market: market({
            id: "m1",
            question: "AAPL",
            stockTicker: "AAPL",
            strikePrice: 200,
            source: "sp500_dynamic",
          }),
        }),
      ),
    ).toBe("AAPL YES ≥ $200.00");

    expect(
      formatStrikeOutcome(
        position({
          id: "p2",
          outcome: "no",
          market: market({ id: "m2", question: "Election?" }),
        }),
      ),
    ).toBe("NO");
  });
});

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
