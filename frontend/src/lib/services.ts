import { getLeaderboard, getStore, getTenantState } from "@/lib/store";
import type {
  ChallengeAccount,
  JournalEntry,
  LeaderboardEntry,
  Market,
  MarketCategory,
  Order,
  Outcome,
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
  return getStore().markets.find((m) => m.id === id) ?? null;
}

export function getAccount(tenantId: string): ChallengeAccount {
  return getTenantState(tenantId).account;
}

export function getPositions(tenantId: string): EnrichedPosition[] {
  const state = getTenantState(tenantId);
  return state.positions.map((pos) => {
    const market = getMarket(pos.marketId)!;
    const currentPrice = pos.outcome === "yes" ? market.yesPrice : 1 - market.yesPrice;
    const value = currentPrice * pos.shares;
    const cost = pos.avgPrice * pos.shares;
    const pnl = value - cost;
    return {
      ...pos,
      market,
      currentPrice,
      value,
      cost,
      pnl,
      pnlPct: cost > 0 ? (pnl / cost) * 100 : 0,
    };
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
}

export interface PlaceOrderResult {
  order: Order;
  position: Position;
}

/**
 * Fills an order at the current market price and updates the tenant's
 * position (weighted-average entry on buys, share reduction on sells).
 */
export function placeOrder(tenantId: string, input: PlaceOrderInput): PlaceOrderResult {
  const market = getMarket(input.marketId);
  if (!market) throw new Error(`Unknown market: ${input.marketId}`);
  if (market.status === "resolved") throw new Error("Market is resolved");
  if (!Number.isFinite(input.shares) || input.shares <= 0) {
    throw new Error("Shares must be a positive number");
  }

  const state = getTenantState(tenantId);
  const price = input.outcome === "yes" ? market.yesPrice : 1 - market.yesPrice;
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

  return { order, position };
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
