/** Core domain types shared across the platform. */

export type MarketCategory =
  | "crypto"
  | "stocks"
  | "forex"
  | "commodities"
  | "economics"
  | "indices";

export type MarketStatus = "open" | "closing_soon" | "resolved";

export type Outcome = "yes" | "no";

export interface PricePoint {
  /** Unix timestamp (ms). */
  t: number;
  /** YES price in [0.01, 0.99]. */
  p: number;
}

export interface Market {
  id: string;
  question: string;
  category: MarketCategory;
  status: MarketStatus;
  /** Current YES price, in probability terms [0.01, 0.99]. */
  yesPrice: number;
  /** 24h price change (absolute, in probability points). */
  change24h: number;
  /** Total volume traded, USD. */
  volume: number;
  /** 24h volume, USD. */
  volume24h: number;
  /** Open interest, USD. */
  openInterest: number;
  /** Number of traders with open positions. */
  traders: number;
  closesAt: number;
  resolvedOutcome?: Outcome;
  history: PricePoint[];
}

export interface Position {
  id: string;
  marketId: string;
  outcome: Outcome;
  /** Number of shares held. */
  shares: number;
  /** Average entry price per share. */
  avgPrice: number;
  openedAt: number;
}

export interface Order {
  id: string;
  marketId: string;
  outcome: Outcome;
  side: "buy" | "sell";
  shares: number;
  price: number;
  filledAt: number;
}

export type ChallengePhase = "evaluation" | "verification" | "funded";

export interface ChallengeObjective {
  id: string;
  label: string;
  /** Current progress value. */
  current: number;
  /** Target value to satisfy the objective. */
  target: number;
  /** Whether lower values are better (e.g. max drawdown). */
  inverted: boolean;
  unit: "usd" | "percent" | "days" | "count";
  met: boolean;
}

export interface ChallengeAccount {
  id: string;
  label: string;
  phase: ChallengePhase;
  startingBalance: number;
  balance: number;
  equity: number;
  /** Today's realized + unrealized P&L. */
  dailyPnl: number;
  totalPnl: number;
  maxDailyLossPct: number;
  maxDrawdownPct: number;
  profitTargetPct: number;
  daysTraded: number;
  minTradingDays: number;
  startedAt: number;
  objectives: ChallengeObjective[];
  equityCurve: PricePoint[];
}

export interface JournalEntry {
  id: string;
  /** "trade" entries record fills; "note" entries are freeform notes. */
  kind: "trade" | "note";
  marketId: string | null;
  marketQuestion: string | null;
  outcome: Outcome | null;
  side: "buy" | "sell" | null;
  shares: number | null;
  price: number | null;
  pnl: number | null;
  note: string;
  tags: string[];
  executedAt: number;
}

export interface LeaderboardEntry {
  rank: number;
  trader: string;
  country: string;
  phase: ChallengePhase;
  accountSize: number;
  profit: number;
  profitPct: number;
  winRate: number;
  trades: number;
}

export type TraderStatus = "active" | "passed" | "failed";

/** A firm's trader as seen by the admin dashboard. */
export interface AdminTrader {
  id: string;
  name: string;
  email: string;
  country: string;
  accountSize: number;
  phase: ChallengePhase;
  status: TraderStatus;
  equity: number;
  pnl: number;
  pnlPct: number;
  winRate: number;
  trades: number;
  /** Share of the max-drawdown budget consumed, 0-100. */
  drawdownUsedPct: number;
  /** Share of today's loss budget consumed, 0-100. */
  dailyLossUsedPct: number;
  joinedAt: number;
  lastActiveAt: number;
}

export interface PortfolioSummary {
  balance: number;
  equity: number;
  openPnl: number;
  dailyPnl: number;
  totalPnl: number;
  winRate: number;
  totalTrades: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  bestDay: number;
  worstDay: number;
}
