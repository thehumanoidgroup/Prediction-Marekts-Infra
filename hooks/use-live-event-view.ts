"use client";

import { useEffect, useRef } from "react";
import type { LiveEvent } from "@/lib/types";

/** Fire-and-forget view tracking for live event analytics. */
export function useLiveEventView(event: LiveEvent) {
  const tracked = useRef(false);

  useEffect(() => {
    if (tracked.current) return;
    tracked.current = true;

    void fetch(`/api/live-events/${encodeURIComponent(event.id)}/view`, {
      method: "POST",
      keepalive: true,
    }).catch(() => {
      tracked.current = false;
    });
  }, [event.id]);
}
