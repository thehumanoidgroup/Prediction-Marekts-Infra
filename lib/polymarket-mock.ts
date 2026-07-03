import type { PolymarketMarket } from "@/lib/types";

const MOCK_POLYMARKETS: PolymarketMarket[] = [
  {
    id: "poly-mock-btc-150k",
    question: "Will Bitcoin reach $150,000 by December 31, 2026?",
    category: "crypto",
    status: "open",
    yesPrice: 0.42,
    change24h: 0.03,
    volume: 2_400_000,
    volume24h: 380_000,
    openInterest: 840_000,
    traders: 1240,
    closesAt: Date.parse("2026-12-31T00:00:00Z"),
    history: [{ t: Date.now(), p: 0.42 }],
    source: "polymarket",
    externalConditionId: "mock-btc-150k",
    marketSlug: "btc-150k-2026",
    acceptingOrders: true,
    outcomes: [
      { label: "Yes", price: 0.42, tokenId: "mock-yes-1" },
      { label: "No", price: 0.58, tokenId: "mock-no-1" },
    ],
  },
  {
    id: "poly-mock-fed-cut",
    question: "Will the Fed cut rates at the September 2026 FOMC meeting?",
    category: "economics",
    status: "open",
    yesPrice: 0.68,
    change24h: -0.02,
    volume: 1_100_000,
    volume24h: 210_000,
    openInterest: 420_000,
    traders: 890,
    closesAt: Date.parse("2026-09-17T00:00:00Z"),
    history: [{ t: Date.now(), p: 0.68 }],
    source: "polymarket",
    externalConditionId: "mock-fed-cut",
    marketSlug: "fed-cut-sep-2026",
    acceptingOrders: true,
    outcomes: [
      { label: "Yes", price: 0.68, tokenId: "mock-yes-2" },
      { label: "No", price: 0.32, tokenId: "mock-no-2" },
    ],
  },
  {
    id: "poly-mock-nvda-6t",
    question: "Will NVIDIA market cap exceed $6T before 2027?",
    category: "stocks",
    status: "closing_soon",
    yesPrice: 0.56,
    change24h: 0.01,
    volume: 890_000,
    volume24h: 145_000,
    openInterest: 310_000,
    traders: 620,
    closesAt: Date.now() + 10 * 24 * 3_600_000,
    history: [{ t: Date.now(), p: 0.56 }],
    source: "polymarket",
    externalConditionId: "mock-nvda-6t",
    marketSlug: "nvda-6t-cap",
    acceptingOrders: true,
    outcomes: [
      { label: "Yes", price: 0.56, tokenId: "mock-yes-3" },
      { label: "No", price: 0.44, tokenId: "mock-no-3" },
    ],
  },
];

export function getMockPolymarketMarkets(filters: {
  query?: string;
  active?: boolean;
} = {}): PolymarketMarket[] {
  let markets = [...MOCK_POLYMARKETS];

  if (filters.active) {
    markets = markets.filter((market) => market.acceptingOrders && market.status !== "resolved");
  }

  const query = filters.query?.trim().toLowerCase();
  if (query) {
    markets = markets.filter(
      (market) =>
        market.question.toLowerCase().includes(query) ||
        market.category.includes(query) ||
        (market.marketSlug ?? "").includes(query),
    );
  }

  return markets;
}

export function getMockPolymarketMarket(id: string): PolymarketMarket | undefined {
  return MOCK_POLYMARKETS.find(
    (market) => market.id === id || market.externalConditionId === id,
  );
}
