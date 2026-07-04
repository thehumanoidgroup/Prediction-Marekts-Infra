import type { MarketCategory } from "@/lib/types";

/** Real-time event categories for subscription filtering. */
export type RealtimeEventCategory =
  | "price"
  | "market"
  | "trade"
  | "risk"
  | "platform";

export interface PriceUpdateEvent {
  type: "price_update";
  category: "price";
  marketId: string;
  marketCategory: MarketCategory;
  yesPrice: number;
  change24h?: number;
  ts: number;
}

export interface MarketStatusEvent {
  type: "market_status";
  category: "market";
  marketId: string;
  marketCategory: MarketCategory;
  status: string;
  ts: number;
}

export interface PlatformEvent {
  type: "platform_event";
  category: "platform";
  eventType: string;
  message: string;
  tenantId?: string | null;
  ts: number;
}

export type RealtimeEvent = PriceUpdateEvent | MarketStatusEvent | PlatformEvent;

export type SubscriptionScope =
  | { scope: "all" }
  | { scope: "category"; category: MarketCategory | RealtimeEventCategory }
  | { scope: "market"; marketId: string }
  | { scope: "event"; eventType: RealtimeEvent["type"] };

export function subscriptionKey(sub: SubscriptionScope): string {
  switch (sub.scope) {
    case "all":
      return "all";
    case "category":
      return `category:${sub.category}`;
    case "market":
      return `market:${sub.marketId}`;
    case "event":
      return `event:${sub.eventType}`;
  }
}

export function redisChannelForScope(sub: SubscriptionScope): string {
  const prefix = process.env.REALTIME_REDIS_PREFIX ?? "proppredict:realtime";
  return `${prefix}:${subscriptionKey(sub)}`;
}

export function eventMatchesSubscription(
  event: RealtimeEvent,
  sub: SubscriptionScope,
): boolean {
  switch (sub.scope) {
    case "all":
      return true;
    case "category":
      if (sub.category === event.category) return true;
      if ("marketCategory" in event && event.marketCategory === sub.category) return true;
      return false;
    case "market":
      return "marketId" in event && event.marketId === sub.marketId;
    case "event":
      return event.type === sub.eventType;
  }
}
