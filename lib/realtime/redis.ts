/**
 * Redis pub/sub for the real-time event feed.
 * Falls back to in-process EventEmitter when REDIS_URL is unset.
 */

import { EventEmitter } from "node:events";
import type { RealtimeEvent, SubscriptionScope } from "@/lib/realtime/types";
import { redisChannelForScope } from "@/lib/realtime/types";

export type RedisBackend = "redis" | "memory";

export interface RedisPubSub {
  backend: RedisBackend;
  publish(scope: SubscriptionScope, event: RealtimeEvent): Promise<void>;
  subscribe(
    scopes: SubscriptionScope[],
    handler: (event: RealtimeEvent, channel: string) => void,
  ): Promise<() => Promise<void>>;
  ping(): Promise<boolean>;
  close(): Promise<void>;
}

const memoryBus = new EventEmitter();
memoryBus.setMaxListeners(100);

class MemoryPubSub implements RedisPubSub {
  backend: RedisBackend = "memory";

  async publish(scope: SubscriptionScope, event: RealtimeEvent): Promise<void> {
    const channel = redisChannelForScope(scope);
    memoryBus.emit(channel, event);
    if (scope.scope !== "all") {
      memoryBus.emit(redisChannelForScope({ scope: "all" }), event);
    }
  }

  async subscribe(
    scopes: SubscriptionScope[],
    handler: (event: RealtimeEvent, channel: string) => void,
  ): Promise<() => Promise<void>> {
    const channels = [...new Set(scopes.map(redisChannelForScope))];
    const listeners = channels.map((channel) => {
      const listener = (event: RealtimeEvent) => handler(event, channel);
      memoryBus.on(channel, listener);
      return { channel, listener };
    });

    return async () => {
      for (const { channel, listener } of listeners) {
        memoryBus.off(channel, listener);
      }
    };
  }

  async ping(): Promise<boolean> {
    return true;
  }

  async close(): Promise<void> {
    memoryBus.removeAllListeners();
  }
}

async function createIoredisPubSub(url: string): Promise<RedisPubSub | null> {
  try {
    const { default: Redis } = await import("ioredis");
    const publisher = new Redis(url, { maxRetriesPerRequest: 2, lazyConnect: true });
    const subscriber = new Redis(url, { maxRetriesPerRequest: 2, lazyConnect: true });
    await publisher.connect();
    await subscriber.connect();

    return {
      backend: "redis",
      async publish(scope, event) {
        const payload = JSON.stringify(event);
        await publisher.publish(redisChannelForScope(scope), payload);
        if (scope.scope !== "all") {
          await publisher.publish(redisChannelForScope({ scope: "all" }), payload);
        }
      },
      async subscribe(scopes, handler) {
        const channels = [...new Set(scopes.map(redisChannelForScope))];
        if (channels.length === 0) return async () => {};

        const onMessage = (channel: string, message: string) => {
          try {
            handler(JSON.parse(message) as RealtimeEvent, channel);
          } catch (error) {
            console.error("[realtime] Invalid Redis message:", error);
          }
        };
        subscriber.on("message", onMessage);
        await subscriber.subscribe(...channels);

        return async () => {
          subscriber.off("message", onMessage);
          if (channels.length > 0) await subscriber.unsubscribe(...channels);
        };
      },
      async ping() {
        return (await publisher.ping()) === "PONG";
      },
      async close() {
        await Promise.allSettled([publisher.quit(), subscriber.quit()]);
      },
    };
  } catch (error) {
    console.warn("[realtime] Redis connection failed:", error);
    return null;
  }
}

let pubSubSingleton: RedisPubSub | null = null;

export async function createRedisPubSub(): Promise<RedisPubSub> {
  const url = process.env.REDIS_URL;
  if (!url) return new MemoryPubSub();
  const redis = await createIoredisPubSub(url);
  return redis ?? new MemoryPubSub();
}

export async function getRedisPubSub(): Promise<RedisPubSub> {
  if (!pubSubSingleton) {
    pubSubSingleton = await createRedisPubSub();
  }
  return pubSubSingleton;
}

/** @internal Test helper */
export function resetRedisPubSub(): void {
  pubSubSingleton = null;
  memoryBus.removeAllListeners();
}
