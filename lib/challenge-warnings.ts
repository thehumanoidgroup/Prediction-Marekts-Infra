/**
 * Challenge-rule warnings for Portfolio / dashboard.
 * Surfaces drawdown and daily-loss proximity so traders can act before a breach.
 */

import type { ChallengeAccount, PortfolioSummary } from "@/lib/types";

export type ChallengeWarningTone = "warn" | "down" | "up" | "neutral";

export interface ChallengeWarning {
  id: string;
  tone: ChallengeWarningTone;
  title: string;
  detail: string;
}

function roundUsd(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Remaining equity buffer above the max-drawdown floor (USD). */
export function drawdownBufferUsd(account: ChallengeAccount): {
  floor: number;
  buffer: number;
  budget: number;
  bufferPct: number;
} {
  const highWater = account.highWaterMark ?? account.startingBalance;
  const floor =
    account.drawdownFloor ??
    account.startingBalance * (1 - account.maxDrawdownPct / 100);
  const budget = Math.max(1, highWater - floor);
  const buffer = account.equity - floor;
  const bufferPct = Math.min(100, Math.max(0, (buffer / budget) * 100));
  return { floor, buffer, budget, bufferPct };
}

/** How much of the daily loss allowance has been consumed (0–100+). */
export function dailyLossUsagePct(
  account: ChallengeAccount,
  summary?: Pick<PortfolioSummary, "dailyPnl" | "openPnl">,
): { usedUsd: number; limitUsd: number; usagePct: number } {
  const dailyPnl = summary?.dailyPnl ?? account.dailyPnl;
  const usedUsd = Math.max(0, -dailyPnl);
  const limitUsd = (account.maxDailyLossPct / 100) * account.startingBalance;
  const usagePct = limitUsd > 0 ? (usedUsd / limitUsd) * 100 : 0;
  return { usedUsd, limitUsd, usagePct };
}

/**
 * Build actionable Portfolio warnings from challenge rules + live P&L.
 * Empty when the account is healthy and far from limits.
 */
export function buildChallengeWarnings(
  account: ChallengeAccount,
  summary?: Pick<PortfolioSummary, "dailyPnl" | "openPnl" | "totalPnl" | "equity">,
): ChallengeWarning[] {
  const warnings: ChallengeWarning[] = [];

  if (account.challengeStatus === "failed") {
    warnings.push({
      id: "challenge-failed",
      tone: "down",
      title: "Challenge failed",
      detail:
        "This evaluation account has breached a hard rule. Trading is closed — contact your prop firm for next steps.",
    });
    return warnings;
  }

  if (account.challengeStatus === "passed") {
    warnings.push({
      id: "challenge-passed",
      tone: "up",
      title: "Challenge passed",
      detail: "Congratulations — your evaluation objectives are complete.",
    });
  }

  const { buffer, bufferPct, floor } = drawdownBufferUsd({
    ...account,
    equity: summary?.equity ?? account.equity,
  });

  if (bufferPct <= 10) {
    warnings.push({
      id: "drawdown-critical",
      tone: "down",
      title: "Near max drawdown",
      detail: `Only $${roundUsd(Math.max(0, buffer)).toLocaleString("en-US")} remains above your $${roundUsd(floor).toLocaleString("en-US")} drawdown floor (${Math.round(bufferPct)}% of buffer). Reduce exposure or close losing positions.`,
    });
  } else if (bufferPct <= 25) {
    warnings.push({
      id: "drawdown-caution",
      tone: "warn",
      title: "Approaching max drawdown",
      detail: `${Math.round(bufferPct)}% of your drawdown buffer remains. Max drawdown limit is ${account.maxDrawdownPct}%.`,
    });
  }

  const { usedUsd, limitUsd, usagePct } = dailyLossUsagePct(account, summary);
  if (limitUsd > 0 && usagePct >= 90) {
    warnings.push({
      id: "daily-loss-critical",
      tone: "down",
      title: "Near daily loss limit",
      detail: `Daily loss $${roundUsd(usedUsd).toLocaleString("en-US")} is ${Math.round(usagePct)}% of your $${roundUsd(limitUsd).toLocaleString("en-US")} daily limit (${account.maxDailyLossPct}%).`,
    });
  } else if (limitUsd > 0 && usagePct >= 70) {
    warnings.push({
      id: "daily-loss-caution",
      tone: "warn",
      title: "Approaching daily loss limit",
      detail: `${Math.round(usagePct)}% of today's $${roundUsd(limitUsd).toLocaleString("en-US")} loss allowance is used.`,
    });
  }

  const ddObjective = account.objectives.find((o) => o.id === "max-drawdown");
  if (ddObjective && !ddObjective.met && !warnings.some((w) => w.id.startsWith("drawdown"))) {
    warnings.push({
      id: "drawdown-objective",
      tone: "warn",
      title: "Drawdown objective at risk",
      detail: `Current drawdown $${roundUsd(ddObjective.current).toLocaleString("en-US")} is approaching the $${roundUsd(ddObjective.target).toLocaleString("en-US")} challenge limit.`,
    });
  }

  const dailyObjective = account.objectives.find((o) => o.id === "daily-loss");
  if (
    dailyObjective &&
    !dailyObjective.met &&
    !warnings.some((w) => w.id.startsWith("daily-loss"))
  ) {
    warnings.push({
      id: "daily-loss-objective",
      tone: "down",
      title: "Daily loss objective breached",
      detail: `Today's loss exceeds the challenge daily loss rule. Further trades may be rejected.`,
    });
  }

  return warnings;
}
