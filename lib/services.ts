import {
  createGlobalMarketTemplate,
  createMarketFromTemplate,
  ensureExternalMarket,
  getAdminTraders as storeAdminTraders,
  getLeaderboard,
  getPlatformAnalyticsSeries,
  getRegisteredMarket,
  getStore,
  getTenantOverrides,
  getTenantState,
  listFirmOverviews as storeFirmOverviews,
  listGlobalTemplates,
  patchTenantOverrides,
  type CreateMarketInput,
  type TenantOverrides,
} from "@/lib/store";
import { getMergedPlatformActivity } from "@/lib/platform/activity";
import { getTenant, listTenants, type TenantConfig } from "@/lib/tenants";
import type {
  AdminTrader,
  ChallengeAccount,
  FirmDetail,
  FirmOverview,
  JournalEntry,
  LeaderboardEntry,
  Market,
  MarketCategory,
  Order,
  Outcome,
  PlatformActivity,
  PlatformAnalyticsPoint,
  PlatformStats,
  PortfolioSummary,
  Position,
} from "@/lib/types";

/**
 * Service layer — the only module pages and API routes talk to for data.
 * Everything is tenant-scoped; the underlying store is an implementation
 * detail (see `src/lib/store.ts`).
 */

export interface EnrichedPosition extends Position {
  market: Market;
  currentPrice: number;
  value: number;
  cost: number;
  pnl: number;
  pnlPct: number;
}

export interface MarketFilters {
  category?: MarketCategory | "all";
  query?: string;
  sort?: "volume" | "newest" | "closing" | "movers";
}

export function listMarkets(filters: MarketFilters = {}): Market[] {
  const { category = "all", query = "", sort = "volume" } = filters;
  let markets = [...getStore().markets];

  if (category !== "all") {
    markets = markets.filter((m) => m.category === category);
  }
  if (query.trim()) {
    const q = query.trim().toLowerCase();
    markets = markets.filter((m) => m.question.toLowerCase().includes(q));
  }

  switch (sort) {
    case "closing":
      markets.sort((a, b) => a.closesAt - b.closesAt);
      break;
    case "movers":
      markets.sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h));
      break;
    case "newest":
      markets.sort((a, b) => b.closesAt - a.closesAt);
      break;
    default:
      markets.sort((a, b) => b.volume - a.volume);
  }
  return markets;
}

export function getMarket(id: string): Market | null {
  return getRegisteredMarket(id);
}

export function getAccount(tenantId: string): ChallengeAccount {
  return getTenantState(tenantId).account;
}

export function getPositions(tenantId: string): EnrichedPosition[] {
  const state = getTenantState(tenantId);
  return state.positions.map((pos) => {
    const market = getRegisteredMarket(pos.marketId) ?? {
      id: pos.marketId,
      question: pos.marketId,
      category: "stocks" as const,
      status: "open" as const,
      yesPrice: pos.avgPrice,
      change24h: 0,
      volume: 0,
      volume24h: 0,
      openInterest: 0,
      traders: 0,
      closesAt: Date.now(),
      history: [],
      source: "internal" as const,
    };
    const currentPrice = pos.outcome === "yes" ? market.yesPrice : 1 - market.yesPrice;
    const value = currentPrice * pos.shares;
    const cost = pos.avgPrice * pos.shares;
    const pnl = value - cost;
    const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;
    return { ...pos, market, currentPrice, value, cost, pnl, pnlPct };
  });
}

export function getJournal(tenantId: string): JournalEntry[] {
  return getTenantState(tenantId).journal;
}

export function getTenantLeaderboard(tenantId: string): LeaderboardEntry[] {
  return getLeaderboard(tenantId);
}

export function getPortfolioSummary(tenantId: string): PortfolioSummary {
  const { account, journal } = getTenantState(tenantId);
  const positions = getPositions(tenantId);
  const openPnl = positions.reduce((sum, p) => sum + p.pnl, 0);

  const closed = journal.filter((j) => j.pnl !== null);
  const wins = closed.filter((j) => (j.pnl ?? 0) > 0);
  const losses = closed.filter((j) => (j.pnl ?? 0) < 0);
  const grossWin = wins.reduce((s, j) => s + (j.pnl ?? 0), 0);
  const grossLoss = Math.abs(losses.reduce((s, j) => s + (j.pnl ?? 0), 0));

  const dailyDeltas = account.equityCurve
    .slice(1)
    .map((point, i) => point.p - account.equityCurve[i].p);

  return {
    balance: account.balance,
    equity: account.equity,
    openPnl,
    dailyPnl: account.dailyPnl,
    totalPnl: account.totalPnl,
    winRate: closed.length ? (wins.length / closed.length) * 100 : 0,
    totalTrades: closed.length,
    avgWin: wins.length ? grossWin / wins.length : 0,
    avgLoss: losses.length ? grossLoss / losses.length : 0,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0,
    bestDay: dailyDeltas.length ? Math.max(...dailyDeltas) : 0,
    worstDay: dailyDeltas.length ? Math.min(...dailyDeltas) : 0,
  };
}

export interface PlaceOrderInput {
  marketId: string;
  outcome: Outcome;
  side: "buy" | "sell";
  shares: number;
  /** Optional market snapshot for Polymarket / Kalshi / S&P 500 virtual fills. */
  market?: Market;
  /** Optional YES price override from the live client tick. */
  yesPrice?: number;
}

export interface PlaceOrderResult {
  order: Order;
  position: Position;
}

/**
 * Fills an order at the current market price and updates the tenant's
 * position (weighted-average entry on buys, share reduction on sells).
 * Supports internal LMSR markets and virtual external provider bets.
 */
export function placeOrder(tenantId: string, input: PlaceOrderInput): PlaceOrderResult {
  let market = input.market ?? getRegisteredMarket(input.marketId);
  if (!market) throw new Error(`Unknown market: ${input.marketId}`);
  if (market.source !== "internal") {
    market = ensureExternalMarket(market);
  }
  if (market.status === "resolved") throw new Error("Market is resolved");
  if (!Number.isFinite(input.shares) || input.shares <= 0) {
    throw new Error("Shares must be a positive number");
  }

  const state = getTenantState(tenantId);
  const yesPrice =
    typeof input.yesPrice === "number" && Number.isFinite(input.yesPrice)
      ? Math.min(0.97, Math.max(0.03, input.yesPrice))
      : market.yesPrice;
  if (market.source !== "internal") {
    market.yesPrice = yesPrice;
    ensureExternalMarket(market);
  }
  const price = input.outcome === "yes" ? yesPrice : 1 - yesPrice;
  const shares = Math.floor(input.shares);

  const order: Order = {
    id: `ord-${tenantId}-${state.orders.length + 1}`,
    marketId: market.id,
    outcome: input.outcome,
    side: input.side,
    shares,
    price,
    filledAt: Date.now(),
  };

  let position = state.positions.find(
    (p) => p.marketId === market.id && p.outcome === input.outcome,
  );

  if (input.side === "buy") {
    const cost = shares * price;
    if (cost > state.account.balance) throw new Error("Insufficient balance");
    if (position) {
      const totalCost = position.avgPrice * position.shares + cost;
      position.shares += shares;
      position.avgPrice = totalCost / position.shares;
    } else {
      position = {
        id: `pos-${tenantId}-${state.positions.length + 1}`,
        marketId: market.id,
        outcome: input.outcome,
        shares,
        avgPrice: price,
        openedAt: Date.now(),
      };
      state.positions.push(position);
    }
    state.account.balance -= cost;
  } else {
    if (!position || position.shares < shares) {
      throw new Error("Not enough shares to sell");
    }
    position.shares -= shares;
    state.account.balance += shares * price;
    if (position.shares === 0) {
      state.positions = state.positions.filter((p) => p.id !== position!.id);
    }
  }

  state.orders.push(order);
  state.journal.unshift({
    id: `jnl-${tenantId}-live-${state.orders.length}`,
    kind: "trade",
    marketId: market.id,
    marketQuestion: market.question,
    outcome: input.outcome,
    side: input.side,
    shares,
    price,
    pnl: null,
    note: "",
    tags: [],
    executedAt: order.filledAt,
  });

  return { order, position: position! };
}

// ---------------------------------------------------------------------------
// Firm admin (PropFirmAdmin) services. In production these sit behind the
// role-gated FastAPI endpoints; the demo store applies them immediately.
// ---------------------------------------------------------------------------

/** Registry config merged with the firm's admin-edited overrides. */
export function getEffectiveTenant(tenantId: string): TenantConfig {
  const base = getTenant(tenantId);
  const overrides = getTenantOverrides(tenantId);
  return {
    ...base,
    name: overrides.name ?? base.name,
    tagline: overrides.tagline ?? base.tagline,
    branding: { ...base.branding, ...overrides.branding },
    features: { ...base.features, ...overrides.features },
    program: { ...base.program, ...overrides.program },
  };
}

/** Applies a white-label settings patch (branding, program rules, flags). */
export function updateTenantSettings(tenantId: string, patch: TenantOverrides): TenantConfig {
  patchTenantOverrides(tenantId, patch);
  return getEffectiveTenant(tenantId);
}

export function getFirmTraders(tenantId: string): AdminTrader[] {
  return [...storeAdminTraders(tenantId)].sort((a, b) => b.pnlPct - a.pnlPct);
}

export interface FirmStats {
  activeTraders: number;
  fundedTraders: number;
  failedTraders: number;
  passRate: number;
  totalEquity: number;
  totalPnl: number;
  avgWinRate: number;
  atRiskTraders: number;
}

export function getFirmStats(tenantId: string): FirmStats {
  const traders = storeAdminTraders(tenantId);
  const finished = traders.filter((t) => t.status !== "active");
  const passed = traders.filter((t) => t.status === "passed");
  return {
    activeTraders: traders.filter((t) => t.status === "active").length,
    fundedTraders: passed.length,
    failedTraders: traders.filter((t) => t.status === "failed").length,
    passRate: finished.length ? (passed.length / finished.length) * 100 : 0,
    totalEquity: traders.reduce((sum, t) => sum + t.equity, 0),
    totalPnl: traders.reduce((sum, t) => sum + t.pnl, 0),
    avgWinRate: traders.length
      ? traders.reduce((sum, t) => sum + t.winRate, 0) / traders.length
      : 0,
    atRiskTraders: traders.filter((t) => t.status === "active" && t.drawdownUsedPct >= 75).length,
  };
}

const MARKET_CATEGORIES: MarketCategory[] = [
  "crypto",
  "stocks",
  "forex",
  "commodities",
  "economics",
  "indices",
];

/** Creates a market from an admin template; validates before mutating. */
export function createMarket(input: CreateMarketInput): Market {
  if (!input.question.trim() || input.question.trim().length < 10) {
    throw new Error("Question must be at least 10 characters");
  }
  if (!MARKET_CATEGORIES.includes(input.category)) {
    throw new Error(`Unknown category: ${input.category}`);
  }
  if (
    !Number.isFinite(input.initialProbability) ||
    input.initialProbability < 0.03 ||
    input.initialProbability > 0.97
  ) {
    throw new Error("Initial probability must be between 3% and 97%");
  }
  if (!Number.isFinite(input.closesAt) || input.closesAt <= Date.now()) {
    throw new Error("Close date must be in the future");
  }
  return createMarketFromTemplate(input);
}

/** Adds a freeform note (no trade attached) to the trader's journal. */
export function addJournalNote(tenantId: string, note: string, tags: string[] = []): JournalEntry {
  const trimmed = note.trim();
  if (!trimmed) throw new Error("Note cannot be empty");

  const state = getTenantState(tenantId);
  const entry: JournalEntry = {
    id: `jnl-${tenantId}-note-${Date.now()}`,
    kind: "note",
    marketId: null,
    marketQuestion: null,
    outcome: null,
    side: null,
    shares: null,
    price: null,
    pnl: null,
    note: trimmed.slice(0, 2000),
    tags: tags.slice(0, 5).map((t) => t.trim().toLowerCase()).filter(Boolean),
    executedAt: Date.now(),
  };
  state.journal.unshift(entry);
  return entry;
}

// ---------------------------------------------------------------------------
// Platform owner (SuperAdmin) services — cross-tenant aggregates and templates.
// ---------------------------------------------------------------------------

export function getPlatformStats(): PlatformStats {
  const firms = storeFirmOverviews();
  const traders = listTenants().flatMap((t) => storeAdminTraders(t.id));
  const finished = traders.filter((t) => t.status !== "active");
  const passed = traders.filter((t) => t.status === "passed");

  return {
    totalFirms: firms.length,
    activeFirms: firms.filter((f) => f.isActive).length,
    totalTraders: traders.length,
    activeTraders: traders.filter((t) => t.status === "active").length,
    volume24h: firms.reduce((sum, f) => sum + f.volume24h, 0),
    totalVolume: firms.reduce((sum, f) => sum + f.totalVolume, 0),
    revenue: firms.reduce((sum, f) => sum + f.revenue, 0),
    revenue24h: firms.reduce((sum, f) => sum + Math.round(f.volume24h * 0.022), 0),
    avgPassRate: finished.length ? (passed.length / finished.length) * 100 : 0,
  };
}

export function listFirmOverviews(): FirmOverview[] {
  return storeFirmOverviews().sort((a, b) => b.totalVolume - a.totalVolume);
}

export function getFirmDetail(tenantId: string): FirmDetail | null {
  const tenant = listTenants().find((t) => t.id === tenantId);
  if (!tenant) return null;

  const overview = storeFirmOverviews().find((f) => f.id === tenantId);
  if (!overview) return null;

  const traders = storeAdminTraders(tenantId);
  const finished = traders.filter((t) => t.status !== "active");
  const passed = traders.filter((t) => t.status === "passed");

  return {
    ...overview,
    tagline: getEffectiveTenant(tenantId).tagline,
    atRiskTraders: traders.filter((t) => t.status === "active" && t.drawdownUsedPct >= 75).length,
    failedTraders: traders.filter((t) => t.status === "failed").length,
    avgWinRate: traders.length
      ? traders.reduce((sum, t) => sum + t.winRate, 0) / traders.length
      : 0,
    totalEquity: traders.reduce((sum, t) => sum + t.equity, 0),
    passRate: finished.length ? (passed.length / finished.length) * 100 : overview.passRate,
    roster: [...traders].sort((a, b) => b.pnlPct - a.pnlPct),
  };
}

export function getPlatformAnalytics(): PlatformAnalyticsPoint[] {
  return getPlatformAnalyticsSeries();
}

export async function getPlatformActivity(): Promise<PlatformActivity[]> {
  return getMergedPlatformActivity();
}

export function listGlobalMarketTemplates(): Market[] {
  return listGlobalTemplates();
}

/** Creates a global market template available to all prop firms. */
export function createGlobalMarket(input: CreateMarketInput): Market {
  if (!input.question.trim() || input.question.trim().length < 10) {
    throw new Error("Question must be at least 10 characters");
  }
  if (!MARKET_CATEGORIES.includes(input.category)) {
    throw new Error(`Unknown category: ${input.category}`);
  }
  if (
    !Number.isFinite(input.initialProbability) ||
    input.initialProbability < 0.03 ||
    input.initialProbability > 0.97
  ) {
    throw new Error("Initial probability must be between 3% and 97%");
  }
  if (!Number.isFinite(input.closesAt) || input.closesAt <= Date.now()) {
    throw new Error("Close date must be in the future");
  }
  return createGlobalMarketTemplate(input);
}
