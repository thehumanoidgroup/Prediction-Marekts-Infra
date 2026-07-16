/** Types and helpers for firm admin account provisioning. */

export type ModelType = "1step" | "2step" | "3step" | "instant" | "evaluation";

export interface ChallengeRules {
  model_type: string;
  account_size: number;
  currency: string;
  profit_target_pct: number;
  max_daily_loss_pct: number;
  max_drawdown_pct: number;
  drawdown_mode: string;
  max_stake_per_order: number | null;
  max_exposure_per_market: number | null;
  max_total_exposure: number | null;
  min_consistency_score: number | null;
  min_trading_days: number;
  challenge_duration_days: number;
  profit_split_pct: number;
  provider: string;
}

export interface ChallengeRulesInput {
  profit_target_pct?: number;
  max_daily_loss_pct?: number;
  max_drawdown_pct?: number;
  drawdown_mode?: "static" | "trailing" | "absolute";
  max_stake_per_order?: number;
  max_exposure_per_market?: number;
  max_total_exposure?: number;
  min_consistency_score?: number;
  min_trading_days?: number;
  challenge_duration_days?: number;
  profit_split_pct?: number;
}

export interface ChallengeTemplate {
  id: string;
  name: string;
  provider: string;
  prop_firm_account_id: string | null;
  prop_firm_slug: string | null;
  prop_firm_label: string | null;
  rules: ChallengeRules;
}

export interface ModelTypePreset {
  model_type: ModelType;
  label: string;
  description: string;
  rules: ChallengeRules;
}

export interface ProvisionResult {
  status: "created";
  message: string;
  user_id: string;
  account_id: string;
  trader_demo_account_id: string;
  sold_record_id: string;
  email: string;
  display_name: string;
  provider: string;
  account_size: number;
  model_type: string;
  created_user: boolean;
  email_sent: boolean;
  credentials_generated: boolean;
  kalshi_live_integration_enabled: boolean;
  kalshi_market_tickers: string[];
  sp500_dynamic_enabled?: boolean;
  sp500_tickers?: string[];
  temporary_password: string | null;
  applied_rules: ChallengeRules;
}

export interface FirmSoldAccount {
  id: string;
  created_at: string;
  trader_demo_account_id: string | null;
  provider: string;
  issuance_source: string;
  account_size: number;
  model_type: string;
  trader_email: string;
  trader_display_name: string;
  kalshi_market_tickers: string[] | null;
  sp500_tickers?: string[] | null;
  credentials_generated: boolean;
  email_sent: boolean;
}

export const ACCOUNT_SIZES = [
  10_000, 25_000, 50_000, 100_000, 200_000, 500_000, 1_000_000, 2_000_000,
] as const;

export const MODEL_TYPES: { id: ModelType; label: string; hint: string }[] = [
  { id: "1step", label: "1-Step", hint: "Single evaluation phase" },
  { id: "2step", label: "2-Step", hint: "Evaluation + verification" },
  { id: "3step", label: "3-Step", hint: "Extended multi-phase" },
  { id: "instant", label: "Instant", hint: "Accelerated funding path" },
];
