import { describe, expect, it, vi } from "vitest";
import { eventMatchesSubscription, subscriptionKey } from "@/lib/realtime/types";
import type { PriceUpdateEvent } from "@/lib/realtime/types";
import { WebSocketManager } from "@/lib/realtime/websocket-manager";

describe("eventMatchesSubscription", () => {
  const priceEvent: PriceUpdateEvent = {
    type: "price_update",
    category: "price",
    marketId: "mkt-1",
    marketCategory: "crypto",
    yesPrice: 0.55,
    ts: Date.now(),
  };

  it("matches all scope", () => {
    expect(eventMatchesSubscription(priceEvent, { scope: "all" })).toBe(true);
  });

  it("matches market category", () => {
    expect(eventMatchesSubscription(priceEvent, { scope: "category", category: "crypto" })).toBe(
      true,
    );
    expect(eventMatchesSubscription(priceEvent, { scope: "category", category: "stocks" })).toBe(
      false,
    );
  });

  it("matches specific market", () => {
    expect(eventMatchesSubscription(priceEvent, { scope: "market", marketId: "mkt-1" })).toBe(
      true,
    );
  });
});

describe("WebSocketManager", () => {
  it("tracks subscriptions and broadcasts matching events", () => {
    const manager = new WebSocketManager();
    const sent: string[] = [];
    const socket = {
      readyState: 1,
      OPEN: 1,
      send: (data: string) => sent.push(data),
      close: vi.fn(),
      on: vi.fn(),
    };

    manager.addConnection(socket);
    manager.handleMessage(
      socket,
      JSON.stringify({ op: "subscribe", scope: "market", marketId: "mkt-1" }),
    );

    const delivered = manager.broadcast({
      type: "price_update",
      category: "price",
      marketId: "mkt-1",
      marketCategory: "crypto",
      yesPrice: 0.61,
      ts: Date.now(),
    });

    expect(delivered).toBe(1);
    expect(sent.some((line) => line.includes("price_update"))).toBe(true);
    expect(subscriptionKey({ scope: "market", marketId: "mkt-1" })).toBe("market:mkt-1");
  });
});
