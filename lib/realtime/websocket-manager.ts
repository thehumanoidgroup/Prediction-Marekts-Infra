/**
 * WebSocket connection manager for the live event feed.
 *
 * TypeScript equivalent of the requested `backend/realtime/websocket_manager.py`.
 * Manages client connections, subscriptions, heartbeats, and targeted delivery.
 */

import { randomUUID } from "node:crypto";
import type { MarketCategory } from "@/lib/types";
import type { RealtimeEvent, SubscriptionScope } from "@/lib/realtime/types";
import { eventMatchesSubscription, subscriptionKey } from "@/lib/realtime/types";
import {
  parseClientMessage,
  type ServerMessage,
  toSubscriptionScope,
} from "@/lib/realtime/protocol";

export interface ManagedSocket {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  readonly readyState: number;
  readonly OPEN?: number;
  on(event: "message", listener: (data: Buffer | string) => void): void;
  on(event: "close", listener: () => void): void;
  on(event: "error", listener: (error: Error) => void): void;
  on(event: "pong", listener: () => void): void;
  ping?(): void;
}

export interface ConnectionMeta {
  id: string;
  ip: string | null;
  connectedAt: number;
  subscriptions: Set<string>;
  lastPongAt: number;
}

export interface WebSocketManagerOptions {
  heartbeatIntervalMs?: number;
  connectionTimeoutMs?: number;
  maxSubscriptionsPerConnection?: number;
}

const DEFAULT_OPTIONS: Required<WebSocketManagerOptions> = {
  heartbeatIntervalMs: 30_000,
  connectionTimeoutMs: 90_000,
  maxSubscriptionsPerConnection: 50,
};

export class WebSocketManager {
  private readonly connections = new Map<ManagedSocket, ConnectionMeta>();
  private readonly options: Required<WebSocketManagerOptions>;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: WebSocketManagerOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  start(): void {
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(() => this.runHeartbeat(), this.options.heartbeatIntervalMs);
  }

  stop(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    for (const socket of this.connections.keys()) {
      this.safeClose(socket, 1001, "Server shutting down");
    }
    this.connections.clear();
  }

  addConnection(socket: ManagedSocket, ip: string | null = null): string {
    const id = randomUUID();
    this.connections.set(socket, {
      id,
      ip,
      connectedAt: Date.now(),
      subscriptions: new Set(["all"]),
      lastPongAt: Date.now(),
    });

    socket.on("close", () => this.removeConnection(socket));
    socket.on("error", (error) => {
      console.error(`[realtime] Connection ${id} error:`, error.message);
      this.removeConnection(socket);
    });
    socket.on("pong", () => {
      const meta = this.connections.get(socket);
      if (meta) meta.lastPongAt = Date.now();
    });

    this.send(socket, {
      type: "connected",
      connectionId: id,
      scopes: ["all"],
      ts: Date.now(),
    });

    return id;
  }

  removeConnection(socket: ManagedSocket): void {
    this.connections.delete(socket);
  }

  getConnectionCount(): number {
    return this.connections.size;
  }

  getConnections(): ConnectionMeta[] {
    return [...this.connections.values()];
  }

  handleMessage(socket: ManagedSocket, raw: string | Buffer): void {
    const text = typeof raw === "string" ? raw : raw.toString("utf8");
    const meta = this.connections.get(socket);
    if (!meta) return;

    try {
      const message = parseClientMessage(text);

      if (message.op === "ping") {
        this.send(socket, { type: "pong", ts: Date.now() });
        return;
      }

      const scope = toSubscriptionScope(message);
      const key = subscriptionKey(scope);

      if (message.op === "subscribe") {
        if (meta.subscriptions.size >= this.options.maxSubscriptionsPerConnection) {
          this.sendError(socket, "SUBSCRIPTION_LIMIT", "Maximum subscriptions reached.");
          return;
        }
        meta.subscriptions.add(key);
        this.send(socket, {
          type: "subscribed",
          scopes: [...meta.subscriptions],
          ts: Date.now(),
        });
        return;
      }

      meta.subscriptions.delete(key);
      this.send(socket, {
        type: "unsubscribed",
        scopes: [...meta.subscriptions],
        ts: Date.now(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid message";
      this.sendError(socket, "INVALID_MESSAGE", message);
    }
  }

  /** Deliver an event to all connections with matching subscriptions. */
  broadcast(event: RealtimeEvent): number {
    let delivered = 0;
    for (const [socket, meta] of this.connections.entries()) {
      if (!this.isOpen(socket)) {
        this.removeConnection(socket);
        continue;
      }
      if (!this.connectionWantsEvent(meta, event)) continue;
      this.send(socket, { type: "event", event, ts: event.ts });
      delivered += 1;
    }
    return delivered;
  }

  private connectionWantsEvent(meta: ConnectionMeta, event: RealtimeEvent): boolean {
    for (const key of meta.subscriptions) {
      const scope = keyToScope(key);
      if (scope && eventMatchesSubscription(event, scope)) return true;
    }
    return false;
  }

  private send(socket: ManagedSocket, message: ServerMessage): void {
    if (!this.isOpen(socket)) return;
    try {
      socket.send(JSON.stringify(message));
    } catch (error) {
      console.error("[realtime] Send failed:", error);
      this.removeConnection(socket);
    }
  }

  private sendError(socket: ManagedSocket, code: string, message: string): void {
    this.send(socket, { type: "error", code, message, ts: Date.now() });
  }

  private isOpen(socket: ManagedSocket): boolean {
    const open = socket.OPEN ?? 1;
    return socket.readyState === open;
  }

  private safeClose(socket: ManagedSocket, code: number, reason: string): void {
    try {
      socket.close(code, reason);
    } catch {
      // ignore close errors
    }
  }

  private runHeartbeat(): void {
    const now = Date.now();
    for (const [socket, meta] of this.connections.entries()) {
      if (!this.isOpen(socket)) {
        this.removeConnection(socket);
        continue;
      }
      if (now - meta.lastPongAt > this.options.connectionTimeoutMs) {
        this.safeClose(socket, 4000, "Heartbeat timeout");
        this.removeConnection(socket);
        continue;
      }
      try {
        socket.ping?.();
      } catch {
        this.removeConnection(socket);
      }
    }
  }
}

function keyToScope(key: string): SubscriptionScope | null {
  if (key === "all") return { scope: "all" };
  const idx = key.indexOf(":");
  if (idx === -1) return null;
  const kind = key.slice(0, idx);
  const value = key.slice(idx + 1);
  if (kind === "category") {
    return { scope: "category", category: value as MarketCategory };
  }
  if (kind === "market") return { scope: "market", marketId: value };
  if (kind === "event") {
    return { scope: "event", eventType: value as RealtimeEvent["type"] };
  }
  return null;
}
