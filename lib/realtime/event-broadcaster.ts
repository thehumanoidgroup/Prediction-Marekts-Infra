/**
 * Publishes real-time events to Redis pub/sub channels.
 *
 * TypeScript equivalent of the requested `backend/realtime/event_broadcaster.py`.
 */

import type { MarketCategory } from "@/lib/types";
import type { RealtimeEvent, SubscriptionScope } from "@/lib/realtime/types";
import { getRedisPubSub, type RedisPubSub } from "@/lib/realtime/redis";

export interface PriceUpdateInput {
  marketId: string;
  marketCategory: MarketCategory;
  yesPrice: number;
  change24h?: number;
}

export class EventBroadcaster {
  private pubSub: RedisPubSub | null = null;

  async init(): Promise<RedisPubSub> {
    if (!this.pubSub) {
      this.pubSub = await getRedisPubSub();
    }
    return this.pubSub;
  }

  get backend(): string {
    return this.pubSub?.backend ?? "uninitialized";
  }

  /** Publish to all matching Redis channels for an event. */
  async broadcast(event: RealtimeEvent): Promise<void> {
    const pubSub = await this.init();
    const scopes: SubscriptionScope[] = [{ scope: "all" }];

    if ("marketCategory" in event && event.marketCategory) {
      scopes.push({ scope: "category", category: event.marketCategory });
    }
    scopes.push({ scope: "category", category: event.category });
    if ("marketId" in event && event.marketId) {
      scopes.push({ scope: "market", marketId: event.marketId });
    }
    scopes.push({ scope: "event", eventType: event.type });

    const unique = new Map(scopes.map((s) => [JSON.stringify(s), s]));
    await Promise.all(
      [...unique.values()].map((scope) => pubSub.publish(scope, event)),
    );
  }

  async broadcastPriceUpdate(input: PriceUpdateInput): Promise<PriceUpdateInput & { ts: number }> {
    const clamped = Math.min(0.97, Math.max(0.03, input.yesPrice));
    const event: RealtimeEvent = {
      type: "price_update",
      category: "price",
      marketId: input.marketId,
      marketCategory: input.marketCategory,
      yesPrice: clamped,
      change24h: input.change24h,
      ts: Date.now(),
    };
    await this.broadcast(event);
    return { ...input, yesPrice: clamped, ts: event.ts };
  }

  async broadcastPlatformEvent(input: {
    eventType: string;
    message: string;
    tenantId?: string | null;
  }): Promise<void> {
    await this.broadcast({
      type: "platform_event",
      category: "platform",
      eventType: input.eventType,
      message: input.message,
      tenantId: input.tenantId ?? null,
      ts: Date.now(),
    });
  }

  async close(): Promise<void> {
    await this.pubSub?.close();
    this.pubSub = null;
  }
}

let broadcasterSingleton: EventBroadcaster | null = null;

export function getEventBroadcaster(): EventBroadcaster {
  if (!broadcasterSingleton) {
    broadcasterSingleton = new EventBroadcaster();
  }
  return broadcasterSingleton;
}

/** @internal Test helper */
export function resetEventBroadcaster(): void {
  broadcasterSingleton = null;
}
