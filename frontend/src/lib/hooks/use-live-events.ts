"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { LiveEvent, LiveEventsPayload, MarketViewSource } from "@/lib/types";
import { useLiveEventsContext } from "@/lib/live-prices";

type LoadState =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "success"; data: LiveEventsPayload };

export function useLiveEventsFeed(
  options: {
    category?: string;
    source?: MarketViewSource;
    limit?: number;
  } = {},
) {
  const { category = "all", source = "all", limit } = options;
  const { events: realtimeEvents, mergeEvents } = useLiveEventsContext();
  const [payload, setPayload] = useState<LoadState>({ status: "loading" });
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const params = new URLSearchParams({ category, source });
      const response = await fetch(`/api/live-events?${params.toString()}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(typeof err.error === "string" ? err.error : "Failed to load live events");
      }
      const data = (await response.json()) as LiveEventsPayload;
      mergeEvents(data.events);
      setPayload({ status: "success", data });
    } catch (error) {
      setPayload({
        status: "error",
        error: error instanceof Error ? error.message : "Failed to load live events",
      });
    } finally {
      setRefreshing(false);
    }
  }, [category, mergeEvents, source]);

  useEffect(() => {
    void load();
  }, [load]);

  const mergedEvents = useMemo(() => {
    if (payload.status !== "success") {
      return realtimeEvents;
    }

    const byExternalId = new Map<string, LiveEvent>();
    for (const event of payload.data.events) {
      byExternalId.set(event.externalId, event);
    }
    for (const event of realtimeEvents) {
      byExternalId.set(event.externalId, { ...byExternalId.get(event.externalId), ...event });
    }

    let events = Array.from(byExternalId.values());
    if (source !== "all") {
      events = events.filter((event) => event.source === source);
    }
    if (category !== "all") {
      events = events.filter((event) => event.category === category);
    }
    events.sort((a, b) => b.volume - a.volume || a.question.localeCompare(b.question));
    if (limit) {
      events = events.slice(0, limit);
    }
    return events;
  }, [category, limit, payload, realtimeEvents, source]);

  return {
    events: mergedEvents,
    payload,
    refreshing,
    reload: load,
  };
}
