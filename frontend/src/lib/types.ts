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
  /** Present when market is sourced from Polymarket CLOB. */
  source?: "polymarket" | "internal";
  externalConditionId?: string;
  marketSlug?: string | null;
  acceptingOrders?: boolean;
  outcomes?: PolymarketOutcome[];
}

export interface PolymarketOutcome {
  tokenId?: string;
  label?: string;
  price: number;
  winner?: boolean;
}

export type PolymarketMarket = Market & {
  source: "polymarket";
  externalConditionId: string;
};

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

/** Platform-owner view of one prop firm. */
export interface FirmOverview {
  id: string;
  slug: string;
  name: string;
  accent: string;
  logoGlyph: string;
  isActive: boolean;
  traders: number;
  activeTraders: number;
  fundedTraders: number;
  volume24h: number;
  totalVolume: number;
  revenue: number;
  passRate: number;
  onboardedAt: number;
}

export type PlatformActivityType =
  | "firm_onboarded"
  | "trader_passed"
  | "trader_failed"
  | "market_created"
  | "volume_milestone"
  | "risk_alert";

export interface PlatformActivity {
  id: string;
  type: PlatformActivityType;
  tenantId: string | null;
  tenantName: string | null;
  message: string;
  ts: number;
}

/** Platform-wide KPI snapshot for the Super Admin overview. */
export interface PlatformStats {
  totalFirms: number;
  activeFirms: number;
  totalTraders: number;
  activeTraders: number;
  volume24h: number;
  totalVolume: number;
  revenue: number;
  revenue24h: number;
  avgPassRate: number;
}

/** One day in the system-wide analytics time series. */
export interface PlatformAnalyticsPoint {
  /** Unix timestamp (ms), start of day. */
  t: number;
  volume: number;
  revenue: number;
  traders: number;
}

/** Drill-down detail for a single prop firm. */
export interface FirmDetail extends FirmOverview {
  tagline: string;
  atRiskTraders: number;
  failedTraders: number;
  avgWinRate: number;
  totalEquity: number;
  roster: AdminTrader[];
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
