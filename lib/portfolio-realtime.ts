/**
 * Portfolio realtime events — shared between WebSocket handlers and order UIs.
 *
 * FastAPI broadcasts ``new_position`` / ``portfolio_update`` over Redis pub/sub.
 * Local order fills also dispatch the same window events so the Portfolio view
 * updates instantly even when the markets WebSocket is not connected.
 */

import type { EnrichedPosition } from "@/lib/services";
import type { PortfolioSummary } from "@/lib/types";

export const PORTFOLIO_WS_EVENT = "pp:portfolio-ws";
export const TRADER_USER_ID_EVENT = "pp:trader-user-id";
export const POSITION_MARK_EVENT = "pp:position-mark";

export type PortfolioWsReason =
  | "order_filled"
  | "position_closed"
  | "position_updated"
  | "mark_to_market";

export interface PortfolioWsPayload {
  type: "new_position" | "portfolio_update";
  reason?: PortfolioWsReason;
  userId?: string;
  marketId?: string;
  position?: EnrichedPosition | null;
  positions?: EnrichedPosition[];
  summary?: Partial<PortfolioSummary>;
  order?: Record<string, unknown>;
  ts?: number;
}

export interface PositionMarkPayload {
  marketId: string;
  yesPrice: number;
}

export function notifyTraderUserId(traderId: string) {
  if (typeof window === "undefined" || !traderId) return;
  window.dispatchEvent(new CustomEvent(TRADER_USER_ID_EVENT, { detail: { traderId } }));
}

export function notifyPortfolioWs(payload: PortfolioWsPayload) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PORTFOLIO_WS_EVENT, { detail: payload }));
}

export function notifyPositionMark(payload: PositionMarkPayload) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(POSITION_MARK_EVENT, { detail: payload }));
}

/** Merge a position upsert/removal into the current open-positions list. */
export function mergePortfolioPositions(
  current: EnrichedPosition[],
  payload: PortfolioWsPayload,
): EnrichedPosition[] {
  if (payload.positions && Array.isArray(payload.positions)) {
    // Full or partial mark-to-market set — overlay by id/market+outcome.
    const byKey = new Map(current.map((p) => [positionKey(p), p]));
    for (const incoming of payload.positions) {
      byKey.set(positionKey(incoming), { ...byKey.get(positionKey(incoming)), ...incoming });
    }
    if (payload.reason === "mark_to_market") {
      return current.map((p) => byKey.get(positionKey(p)) ?? p);
    }
    return [...byKey.values()];
  }

  const incoming = payload.position;
  if (payload.reason === "position_closed" || incoming == null) {
    if (!payload.marketId && !incoming) return current;
    const marketId = payload.marketId ?? incoming?.marketId;
    const outcome = incoming?.outcome;
    return current.filter((p) => {
      if (p.marketId !== marketId) return true;
      if (outcome && p.outcome !== outcome) return true;
      return false;
    });
  }

  const key = positionKey(incoming);
  const index = current.findIndex((p) => positionKey(p) === key);
  if (index === -1) return [incoming, ...current];
  const next = [...current];
  next[index] = { ...current[index], ...incoming };
  return next;
}

export function applyYesPriceToPositions(
  positions: EnrichedPosition[],
  marketId: string,
  yesPrice: number,
): EnrichedPosition[] {
  let changed = false;
  const next = positions.map((position) => {
    if (position.marketId !== marketId && position.market?.id !== marketId) {
      return position;
    }
    changed = true;
    const currentPrice = position.outcome === "yes" ? yesPrice : 1 - yesPrice;
    const value = currentPrice * position.shares;
    const cost = position.avgPrice * position.shares;
    const pnl = value - cost;
    const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;
    return {
      ...position,
      currentPrice,
      value,
      cost,
      pnl,
      pnlPct,
      market: {
        ...position.market,
        yesPrice,
      },
    };
  });
  return changed ? next : positions;
}

export function summarizeOpenPnl(positions: EnrichedPosition[]): number {
  return positions.reduce((sum, p) => sum + (p.pnl ?? 0), 0);
}

function positionKey(position: Pick<EnrichedPosition, "id" | "marketId" | "outcome">): string {
  return position.id || `${position.marketId}:${position.outcome}`;
}
