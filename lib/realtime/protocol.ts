import { z } from "zod";
import type { MarketCategory } from "@/lib/types";
import type { RealtimeEventCategory } from "@/lib/realtime/types";

const marketCategorySchema = z.enum([
  "crypto",
  "stocks",
  "forex",
  "commodities",
  "economics",
  "indices",
]);

const eventCategorySchema = z.enum(["price", "market", "trade", "risk", "platform"]);

const subscribeOpSchema = z.enum(["subscribe", "unsubscribe"]);

export const clientMessageSchema = z.union([
  z.object({ op: z.literal("ping") }),
  z.object({ op: subscribeOpSchema, scope: z.literal("all") }),
  z.object({
    op: subscribeOpSchema,
    scope: z.literal("category"),
    category: z.union([marketCategorySchema, eventCategorySchema]),
  }),
  z.object({
    op: subscribeOpSchema,
    scope: z.literal("market"),
    marketId: z.string().min(1).max(128),
  }),
  z.object({
    op: subscribeOpSchema,
    scope: z.literal("event"),
    eventType: z.enum(["price_update", "market_status", "platform_event"]),
  }),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;

export interface ServerMessage {
  type: "event" | "subscribed" | "unsubscribed" | "error" | "pong" | "connected";
  event?: import("@/lib/realtime/types").RealtimeEvent;
  scopes?: string[];
  code?: string;
  message?: string;
  ts?: number;
  connectionId?: string;
}

export function parseClientMessage(raw: string): ClientMessage {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error("Invalid JSON message");
  }
  return clientMessageSchema.parse(json);
}

export function toSubscriptionScope(
  message: Extract<ClientMessage, { op: "subscribe" | "unsubscribe" }>,
): import("@/lib/realtime/types").SubscriptionScope {
  if (message.scope === "all") return { scope: "all" };
  if (message.scope === "category") {
    return {
      scope: "category",
      category: message.category as MarketCategory | RealtimeEventCategory,
    };
  }
  if (message.scope === "market") return { scope: "market", marketId: message.marketId };
  return { scope: "event", eventType: message.eventType };
}
