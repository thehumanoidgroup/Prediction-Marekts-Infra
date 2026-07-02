import { createRng, seedFromString } from "@/lib/rng";
import type {
  ChallengeAccount,
  ChallengeObjective,
  JournalEntry,
  LeaderboardEntry,
  Market,
  MarketCategory,
  Order,
  Outcome,
  Position,
  PricePoint,
} from "@/lib/types";
import { getTenant } from "@/lib/tenants";

/**
 * In-memory data store seeded deterministically per process.
 *
 * This stands in for the real persistence layer (Postgres + a matching
 * engine). All reads/writes go through the service functions in
 * `src/lib/services.ts`, so swapping this out for real infrastructure is a
 * single-module change. Stored on `globalThis` to survive dev HMR.
 */

interface TenantState {
  account: ChallengeAccount;
  positions: Position[];
  orders: Order[];
  journal: JournalEntry[];
}

interface Store {
  markets: Market[];
  tenants: Map<string, TenantState>;
  leaderboards: Map<string, LeaderboardEntry[]>;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const MARKET_SEEDS: Array<{
  question: string;
  category: MarketCategory;
  basePrice: number;
  daysToClose: number;
  volumeScale: number;
}> = [
  { question: "Will BTC close above $150K on Dec 31, 2026?", category: "crypto", basePrice: 0.42, daysToClose: 182, volumeScale: 4.2 },
  { question: "Will ETH flip $10K before October 2026?", category: "crypto", basePrice: 0.18, daysToClose: 90, volumeScale: 2.1 },
  { question: "Will SOL trade above $500 by end of Q3 2026?", category: "crypto", basePrice: 0.31, daysToClose: 91, volumeScale: 1.6 },
  { question: "Will NVDA market cap exceed $6T by year end?", category: "stocks", basePrice: 0.56, daysToClose: 182, volumeScale: 3.8 },
  { question: "Will AAPL announce an AI wearable in 2026?", category: "stocks", basePrice: 0.37, daysToClose: 150, volumeScale: 1.4 },
  { question: "Will TSLA deliver 2.5M+ vehicles in 2026?", category: "stocks", basePrice: 0.44, daysToClose: 210, volumeScale: 2.4 },
  { question: "Will EUR/USD trade above 1.15 by September?", category: "forex", basePrice: 0.61, daysToClose: 75, volumeScale: 1.9 },
  { question: "Will USD/JPY break below 140 this quarter?", category: "forex", basePrice: 0.28, daysToClose: 60, volumeScale: 1.2 },
  { question: "Will gold close above $3,500/oz in August 2026?", category: "commodities", basePrice: 0.52, daysToClose: 45, volumeScale: 2.7 },
  { question: "Will WTI crude average under $70 in Q3 2026?", category: "commodities", basePrice: 0.47, daysToClose: 91, volumeScale: 1.1 },
  { question: "Will the Fed cut rates at the September FOMC?", category: "economics", basePrice: 0.68, daysToClose: 76, volumeScale: 5.1 },
  { question: "Will US CPI YoY print below 2.5% in July?", category: "economics", basePrice: 0.33, daysToClose: 12, volumeScale: 3.3 },
  { question: "Will US unemployment exceed 4.5% by October?", category: "economics", basePrice: 0.24, daysToClose: 110, volumeScale: 1.8 },
  { question: "Will the S&P 500 close above 7,000 this year?", category: "indices", basePrice: 0.58, daysToClose: 182, volumeScale: 4.6 },
  { question: "Will the Nasdaq-100 hit a new ATH in July 2026?", category: "indices", basePrice: 0.71, daysToClose: 29, volumeScale: 2.9 },
  { question: "Will the VIX spike above 35 before September?", category: "indices", basePrice: 0.19, daysToClose: 74, volumeScale: 1.5 },
];

const TRADER_NAMES = [
  "M. Okafor", "S. Lindqvist", "J. Tanaka", "A. Petrov", "L. Fernandez",
  "K. Nguyen", "D. Whitfield", "R. Kaur", "T. Brandt", "C. Moreau",
  "H. Yamamoto", "P. Kowalski", "N. Adeyemi", "V. Rossi", "E. Johansson",
  "B. Castillo", "F. Novak", "G. Mensah", "I. Dimitrov", "W. Zhang",
];

const COUNTRIES = ["US", "SE", "JP", "BG", "ES", "VN", "GB", "IN", "DE", "FR", "JP", "PL", "NG", "IT", "SE", "MX", "CZ", "GH", "BG", "CN"];

const JOURNAL_NOTES = [
  "Entered on CPI momentum; probability lagged the bond market repricing.",
  "Faded the overreaction after the headline — mean reversion setup.",
  "Scaled in ahead of the weekend, low liquidity gave a better fill.",
  "Cut early. Thesis invalidated by the Fed minutes language.",
  "News-driven spike; took profit into the crowd.",
  "Held through the drawdown — conviction trade on macro data.",
  "Small starter position, will add if price confirms under 30¢.",
  "Exited at target. Disciplined take-profit per plan.",
];

const JOURNAL_TAGS = ["macro", "momentum", "mean-reversion", "news", "swing", "scalp", "high-conviction", "hedge"];

function generateHistory(rng: () => number, basePrice: number, now: number): PricePoint[] {
  const points: PricePoint[] = [];
  const steps = 90;
  let price = Math.min(0.95, Math.max(0.05, basePrice + (rng() - 0.5) * 0.2));
  for (let i = steps; i >= 0; i--) {
    const drift = (basePrice - price) * 0.03;
    price = Math.min(0.97, Math.max(0.03, price + drift + (rng() - 0.5) * 0.05));
    points.push({ t: now - i * 8 * HOUR, p: Number(price.toFixed(3)) });
  }
  // Anchor the last point at the seeded base price so cards match charts.
  points[points.length - 1] = { t: now, p: basePrice };
  return points;
}

function generateMarkets(now: number): Market[] {
  return MARKET_SEEDS.map((seed, index) => {
    const rng = createRng(seedFromString(seed.question));
    const history = generateHistory(rng, seed.basePrice, now);
    const dayAgo = history.find((p) => p.t >= now - DAY) ?? history[0];
    const closesAt = now + seed.daysToClose * DAY;
    const volume = Math.round(seed.volumeScale * 900_000 + rng() * 400_000);
    return {
      id: `mkt-${index + 1}`,
      question: seed.question,
      category: seed.category,
      status: seed.daysToClose <= 14 ? "closing_soon" : "open",
      yesPrice: seed.basePrice,
      change24h: Number((seed.basePrice - dayAgo.p).toFixed(3)),
      volume,
      volume24h: Math.round(volume * (0.04 + rng() * 0.08)),
      openInterest: Math.round(volume * (0.3 + rng() * 0.3)),
      traders: Math.round(120 + rng() * 2400),
      closesAt,
      history,
    };
  });
}

function buildObjectives(account: {
  totalPnl: number;
  startingBalance: number;
  dailyPnl: number;
  daysTraded: number;
  minTradingDays: number;
  profitTargetPct: number;
  maxDailyLossPct: number;
  maxDrawdownPct: number;
  maxDrawdownUsd: number;
}): ChallengeObjective[] {
  const profitTargetUsd = (account.profitTargetPct / 100) * account.startingBalance;
  const maxDailyLossUsd = (account.maxDailyLossPct / 100) * account.startingBalance;
  const maxDrawdownUsd = (account.maxDrawdownPct / 100) * account.startingBalance;
  return [
    {
      id: "profit-target",
      label: "Profit target",
      current: Math.max(0, account.totalPnl),
      target: profitTargetUsd,
      inverted: false,
      unit: "usd",
      met: account.totalPnl >= profitTargetUsd,
    },
    {
      id: "daily-loss",
      label: "Max daily loss",
      current: Math.max(0, -account.dailyPnl),
      target: maxDailyLossUsd,
      inverted: true,
      unit: "usd",
      met: -account.dailyPnl < maxDailyLossUsd,
    },
    {
      id: "max-drawdown",
      label: "Max drawdown",
      current: account.maxDrawdownUsd,
      target: maxDrawdownUsd,
      inverted: true,
      unit: "usd",
      met: account.maxDrawdownUsd < maxDrawdownUsd,
    },
    {
      id: "trading-days",
      label: "Min trading days",
      current: account.daysTraded,
      target: account.minTradingDays,
      inverted: false,
      unit: "days",
      met: account.daysTraded >= account.minTradingDays,
    },
  ];
}

function generateTenantState(tenantId: string, markets: Market[], now: number): TenantState {
  const rng = createRng(seedFromString(`tenant:${tenantId}`));
  const program = getTenant(tenantId).program;
  const startingBalance = program.accountSizes[Math.min(1, program.accountSizes.length - 1)];

  // Equity curve: 30 trading days with a mild upward bias.
  const equityCurve: PricePoint[] = [];
  let equity = startingBalance;
  let peak = startingBalance;
  let maxDrawdownUsd = 0;
  const days = 30;
  for (let i = days; i >= 0; i--) {
    const dailyMove = (rng() - 0.44) * startingBalance * 0.012;
    equity = Math.max(startingBalance * 0.9, equity + dailyMove);
    peak = Math.max(peak, equity);
    maxDrawdownUsd = Math.max(maxDrawdownUsd, peak - equity);
    equityCurve.push({ t: now - i * DAY, p: Math.round(equity) });
  }
  const balance = equityCurve[equityCurve.length - 1].p;
  const prevClose = equityCurve[equityCurve.length - 2].p;

  // Open positions in a handful of markets.
  const positionMarkets = [...markets]
    .sort(() => rng() - 0.5)
    .slice(0, 5);
  const positions: Position[] = positionMarkets.map((market, i) => {
    const outcome: Outcome = rng() > 0.45 ? "yes" : "no";
    const entryDrift = (rng() - 0.5) * 0.12;
    const currentPrice = outcome === "yes" ? market.yesPrice : 1 - market.yesPrice;
    const avgPrice = Math.min(0.95, Math.max(0.05, currentPrice - entryDrift));
    return {
      id: `pos-${tenantId}-${i + 1}`,
      marketId: market.id,
      outcome,
      shares: Math.round(200 + rng() * 1800),
      avgPrice: Number(avgPrice.toFixed(2)),
      openedAt: now - Math.round(rng() * 12) * DAY - Math.round(rng() * 20) * HOUR,
    };
  });

  const openPnl = positions.reduce((sum, pos) => {
    const market = markets.find((m) => m.id === pos.marketId)!;
    const current = pos.outcome === "yes" ? market.yesPrice : 1 - market.yesPrice;
    return sum + (current - pos.avgPrice) * pos.shares;
  }, 0);

  const equityNow = balance + openPnl;
  const totalPnl = equityNow - startingBalance;
  const dailyPnl = equityNow - prevClose;
  const daysTraded = 14 + Math.round(rng() * 8);

  // Journal: a mix of closed trades (with P&L) and recent opens.
  const journal: JournalEntry[] = Array.from({ length: 14 }, (_, i) => {
    const market = markets[Math.floor(rng() * markets.length)];
    const outcome: Outcome = rng() > 0.5 ? "yes" : "no";
    const side = rng() > 0.35 ? "buy" : "sell";
    const closed = i > 2;
    const shares = Math.round(100 + rng() * 1500);
    const price = Number((0.1 + rng() * 0.8).toFixed(2));
    const win = rng() > 0.42;
    return {
      id: `jnl-${tenantId}-${i + 1}`,
      kind: "trade" as const,
      marketId: market.id,
      marketQuestion: market.question,
      outcome,
      side,
      shares,
      price,
      pnl: closed ? Number(((win ? 1 : -1) * shares * price * (0.08 + rng() * 0.35)).toFixed(2)) : null,
      note: JOURNAL_NOTES[Math.floor(rng() * JOURNAL_NOTES.length)],
      tags: [...JOURNAL_TAGS].sort(() => rng() - 0.5).slice(0, 1 + Math.floor(rng() * 2)),
      executedAt: now - i * 0.9 * DAY - rng() * 10 * HOUR,
    };
  });

  const account: ChallengeAccount = {
    id: `acct-${tenantId}-1`,
    label: `${startingBalance / 1000}K Evaluation`,
    phase: "evaluation",
    startingBalance,
    balance: Math.round(balance),
    equity: Math.round(equityNow),
    dailyPnl: Math.round(dailyPnl),
    totalPnl: Math.round(totalPnl),
    maxDailyLossPct: program.maxDailyLossPct,
    maxDrawdownPct: program.maxDrawdownPct,
    profitTargetPct: program.profitTargetPct,
    daysTraded,
    minTradingDays: 10,
    startedAt: now - days * DAY,
    objectives: buildObjectives({
      totalPnl,
      startingBalance,
      dailyPnl,
      daysTraded,
      minTradingDays: 10,
      profitTargetPct: program.profitTargetPct,
      maxDailyLossPct: program.maxDailyLossPct,
      maxDrawdownPct: program.maxDrawdownPct,
      maxDrawdownUsd,
    }),
    equityCurve,
  };

  return { account, positions, orders: [], journal };
}

function generateLeaderboard(tenantId: string): LeaderboardEntry[] {
  const rng = createRng(seedFromString(`leaderboard:${tenantId}`));
  const program = getTenant(tenantId).program;
  const entries = TRADER_NAMES.map((trader, i) => {
    const accountSize = program.accountSizes[Math.floor(rng() * program.accountSizes.length)];
    const profitPct = 2 + rng() * 24;
    const phase: LeaderboardEntry["phase"] =
      rng() > 0.7 ? "funded" : rng() > 0.4 ? "verification" : "evaluation";
    return {
      rank: 0,
      trader,
      country: COUNTRIES[i],
      phase,
      accountSize,
      profit: Math.round((profitPct / 100) * accountSize),
      profitPct: Number(profitPct.toFixed(1)),
      winRate: Number((44 + rng() * 28).toFixed(1)),
      trades: Math.round(20 + rng() * 260),
    };
  });
  return entries
    .sort((a, b) => b.profitPct - a.profitPct)
    .map((entry, i) => ({ ...entry, rank: i + 1 }));
}

function createStore(): Store {
  const now = Date.now();
  return {
    markets: generateMarkets(now),
    tenants: new Map(),
    leaderboards: new Map(),
  };
}

const globalStore = globalThis as unknown as { __ppStore?: Store };

export function getStore(): Store {
  if (!globalStore.__ppStore) {
    globalStore.__ppStore = createStore();
  }
  return globalStore.__ppStore;
}

export function getTenantState(tenantId: string): TenantState {
  const store = getStore();
  let state = store.tenants.get(tenantId);
  if (!state) {
    state = generateTenantState(tenantId, store.markets, Date.now());
    store.tenants.set(tenantId, state);
  }
  return state;
}

export function getLeaderboard(tenantId: string): LeaderboardEntry[] {
  const store = getStore();
  let board = store.leaderboards.get(tenantId);
  if (!board) {
    board = generateLeaderboard(tenantId);
    store.leaderboards.set(tenantId, board);
  }
  return board;
}

export { buildObjectives };
