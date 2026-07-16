/**
 * Pre-filled challenge rule templates for S&P 500 dynamic stock-event accounts.
 */

import type { ChallengeTemplate } from "@/lib/account-provisioning";
import { SP500_DASHBOARD_TICKERS } from "@/lib/sp500/sectors";

/** Default liquid universe linked to newly issued SPX evaluation accounts. */
export const DEFAULT_SP500_TICKERS = SP500_DASHBOARD_TICKERS.slice(0, 20);

export const SP500_STOCK_EVENT_TEMPLATES: ChallengeTemplate[] = [
  {
    id: "sp500-0dte-standard",
    name: "0DTE Stock Events · Standard",
    provider: "sp500_dynamic",
    prop_firm_account_id: null,
    prop_firm_slug: "sp500-0dte",
    prop_firm_label: "S&P 500 0DTE",
    rules: {
      model_type: "1step",
      account_size: 25_000,
      currency: "USD",
      profit_target_pct: 8,
      max_daily_loss_pct: 4,
      max_drawdown_pct: 8,
      drawdown_mode: "static",
      max_stake_per_order: 1_250,
      max_exposure_per_market: 2_500,
      max_total_exposure: 7_500,
      min_consistency_score: null,
      min_trading_days: 5,
      challenge_duration_days: 30,
      profit_split_pct: 80,
      provider: "sp500_dynamic",
    },
  },
  {
    id: "sp500-weekly-standard",
    name: "Weekly Stock Events · Standard",
    provider: "sp500_dynamic",
    prop_firm_account_id: null,
    prop_firm_slug: "sp500-weekly",
    prop_firm_label: "S&P 500 Weekly",
    rules: {
      model_type: "1step",
      account_size: 50_000,
      currency: "USD",
      profit_target_pct: 10,
      max_daily_loss_pct: 5,
      max_drawdown_pct: 10,
      drawdown_mode: "trailing",
      max_stake_per_order: 2_500,
      max_exposure_per_market: 5_000,
      max_total_exposure: 15_000,
      min_consistency_score: null,
      min_trading_days: 7,
      challenge_duration_days: 45,
      profit_split_pct: 80,
      provider: "sp500_dynamic",
    },
  },
  {
    id: "sp500-0dte-aggressive",
    name: "0DTE Stock Events · Aggressive",
    provider: "sp500_dynamic",
    prop_firm_account_id: null,
    prop_firm_slug: "sp500-0dte-agg",
    prop_firm_label: "S&P 500 0DTE Aggressive",
    rules: {
      model_type: "instant",
      account_size: 25_000,
      currency: "USD",
      profit_target_pct: 12,
      max_daily_loss_pct: 3,
      max_drawdown_pct: 6,
      drawdown_mode: "static",
      max_stake_per_order: 1_000,
      max_exposure_per_market: 2_000,
      max_total_exposure: 5_000,
      min_consistency_score: 0.55,
      min_trading_days: 3,
      challenge_duration_days: 21,
      profit_split_pct: 85,
      provider: "sp500_dynamic",
    },
  },
  {
    id: "sp500-2step-equity",
    name: "Equity Stock Events · 2-Step",
    provider: "sp500_dynamic",
    prop_firm_account_id: null,
    prop_firm_slug: "sp500-2step",
    prop_firm_label: "S&P 500 2-Step",
    rules: {
      model_type: "2step",
      account_size: 100_000,
      currency: "USD",
      profit_target_pct: 8,
      max_daily_loss_pct: 4,
      max_drawdown_pct: 8,
      drawdown_mode: "trailing",
      max_stake_per_order: 4_000,
      max_exposure_per_market: 8_000,
      max_total_exposure: 25_000,
      min_consistency_score: 0.6,
      min_trading_days: 10,
      challenge_duration_days: 60,
      profit_split_pct: 80,
      provider: "sp500_dynamic",
    },
  },
];

export function listSp500ChallengeTemplates(): ChallengeTemplate[] {
  return SP500_STOCK_EVENT_TEMPLATES.map((t) => ({ ...t, rules: { ...t.rules } }));
}

export function getSp500ChallengeTemplate(id: string): ChallengeTemplate | null {
  return SP500_STOCK_EVENT_TEMPLATES.find((t) => t.id === id) ?? null;
}
