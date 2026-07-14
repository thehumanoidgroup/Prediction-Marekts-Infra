"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatCompactUsd } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { MarketSourceBadge } from "@/components/markets/market-source-badge";
import type { LiveEventSource } from "@/lib/types";

interface LiveFeedMonitorPayload {
  connections: {
    total_connections: number;
    connections_by_tenant: Record<string, number>;
    sockets: Array<{
      tenant_slug: string;
      connected_at: number;
      messages_received: number;
      rooms: string[];
    }>;
  };
  analytics: {
    updates_per_minute: number;
    tracked_events: number;
    uptime_seconds: number;
    top_viewed_events: Array<{
      event_id: string;
      views: number;
      updates: number;
      question?: string | null;
      external_id?: string | null;
      category?: string | null;
      source?: string | null;
    }>;
  };
  events: {
    count: number;
    counts_by_source: Record<string, number>;
    active: Array<{
      id: string;
      external_id: string;
      source: LiveEventSource;
      category: string;
      status: string;
      question: string;
      probabilities: { yes?: number };
      volume: number;
      volume_24h: number;
      change_24h: number;
    }>;
  };
}

export function LiveFeedMonitor() {
  const [payload, setPayload] = useState<LiveFeedMonitorPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const response = await fetch("/api/platform/live-feed", { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Failed to load live feed monitor");
        }
        const data = (await response.json()) as LiveFeedMonitorPayload;
        if (active) {
          setPayload(data);
          setError(null);
        }
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load monitor");
        }
      }
    };

    void load();
    const interval = setInterval(() => void load(), 10_000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  if (error) {
    return <p className="py-8 text-center text-sm text-down">{error}</p>;
  }

  if (!payload) {
    return <div className="h-64 animate-pulse rounded-card border border-edge bg-surface" />;
  }

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Card className="xl:col-span-1">
        <CardHeader title="WebSocket connections" subtitle="Active tenant channels" />
        <CardBody className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">Total connections</span>
            <span className="font-semibold tabular-nums">{payload.connections.total_connections}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">Updates / min</span>
            <span className="font-semibold tabular-nums">{payload.analytics.updates_per_minute}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">Tracked events</span>
            <span className="font-semibold tabular-nums">{payload.analytics.tracked_events}</span>
          </div>
          <div className="border-t border-edge/60 pt-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-faint">
              By tenant
            </p>
            <ul className="space-y-1 text-sm">
              {Object.entries(payload.connections.connections_by_tenant).map(([slug, count]) => (
                <li key={slug} className="flex justify-between">
                  <span>{slug}</span>
                  <span className="tabular-nums text-muted">{count}</span>
                </li>
              ))}
              {Object.keys(payload.connections.connections_by_tenant).length === 0 ? (
                <li className="text-muted">No active connections</li>
              ) : null}
            </ul>
          </div>
        </CardBody>
      </Card>

      <Card className="xl:col-span-2">
        <CardHeader
          title="Most viewed live events"
          subtitle="Engagement analytics from client view tracking"
        />
        <CardBody>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-faint">
                <tr>
                  <th className="pb-2 pr-3">Event</th>
                  <th className="pb-2 pr-3">Views</th>
                  <th className="pb-2 pr-3">Updates</th>
                  <th className="pb-2">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-edge/60">
                {payload.analytics.top_viewed_events.map((row) => (
                  <tr key={row.event_id}>
                    <td className="py-2 pr-3">
                      <p className="line-clamp-1 font-medium">{row.question ?? row.event_id}</p>
                      <p className="text-[11px] text-faint">{row.external_id ?? row.event_id}</p>
                    </td>
                    <td className="py-2 pr-3 tabular-nums">{row.views}</td>
                    <td className="py-2 pr-3 tabular-nums">{row.updates}</td>
                    <td className="py-2">
                      {row.source ? (
                        <MarketSourceBadge source={row.source as LiveEventSource} compact />
                      ) : (
                        <Badge>—</Badge>
                      )}
                    </td>
                  </tr>
                ))}
                {payload.analytics.top_viewed_events.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-muted">
                      No engagement data yet
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      <Card className="xl:col-span-3">
        <CardHeader
          title="Active live events"
          subtitle={`${payload.events.count} events · ${payload.events.counts_by_source.internal ?? 0} internal · ${payload.events.counts_by_source.polymarket ?? 0} polymarket · ${payload.events.counts_by_source.external ?? 0} external`}
        />
        <CardBody>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {payload.events.active.map((event) => (
              <div key={event.id} className="rounded-lg border border-edge bg-surface-2 p-3">
                <div className="flex items-center gap-2">
                  <MarketSourceBadge source={event.source} compact />
                  <Badge>{event.category}</Badge>
                </div>
                <p className="mt-2 line-clamp-2 text-sm font-medium">{event.question}</p>
                <div className="mt-2 flex items-center justify-between text-xs text-muted">
                  <span className="tabular-nums">
                    {Math.round((event.probabilities.yes ?? 0.5) * 100)}% YES
                  </span>
                  <span>{formatCompactUsd(event.volume)} vol</span>
                </div>
                <Link
                  href={`/markets/${event.external_id}`}
                  className="mt-2 inline-block text-xs font-medium text-accent"
                >
                  Open market
                </Link>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
