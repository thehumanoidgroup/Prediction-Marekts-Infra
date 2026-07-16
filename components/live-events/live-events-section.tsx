"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { LiveEventCard } from "@/components/live-events/live-event-card";
import { MarketSourceToggle } from "@/components/markets/market-source-toggle";
import { useLiveEventsFeed } from "@/hooks/use-live-events";
import type { MarketViewSource } from "@/lib/types";
import { cn } from "@/lib/utils";

function sectionTitle(source: MarketViewSource): string {
  switch (source) {
    case "internal":
      return "Live Events · Internal";
    case "polymarket":
      return "Live Events · Polymarket";
    case "kalshi":
      return "Live Events · Kalshi";
    case "sp500_dynamic":
      return "Live Events · S&P 500";
    default:
      return "Live Events";
  }
}

function sectionSubtitle(source: MarketViewSource): string {
  switch (source) {
    case "internal":
      return "PropPredict LMSR simulation markets";
    case "polymarket":
      return "Live odds from Polymarket CLOB";
    case "kalshi":
      return "Live odds from Kalshi";
    case "sp500_dynamic":
      return "Dynamic S&P 500 stock prediction markets";
    default:
      return "Internal LMSR + live external feeds";
  }
}

function LiveEventsSectionBody() {
  const [source, setSource] = useState<MarketViewSource>("all");
  const { events, payload, refreshing } = useLiveEventsFeed({ source, limit: 6 });

  const counts =
    payload.status === "success"
      ? payload.data.counts
      : {
          internal: events.filter((event) => event.source === "internal").length,
          polymarket: events.filter((event) => event.source === "polymarket").length,
          kalshi: events.filter((event) => event.source === "kalshi").length,
          sp500_dynamic: events.filter((event) => event.source === "sp500_dynamic").length,
        };

  const isLoading = payload.status === "loading";
  const isError = payload.status === "error";

  const viewAllHref =
    source === "polymarket"
      ? "/markets?source=polymarket"
      : source === "kalshi"
        ? "/markets?source=kalshi"
        : source === "sp500_dynamic"
          ? "/markets?source=sp500_dynamic"
          : source === "internal"
            ? "/markets?source=internal"
            : "/markets";

  return (
    <Card>
      <CardHeader
        title={sectionTitle(source)}
        subtitle={
          source === "all"
            ? `${sectionSubtitle(source)} · ${counts.internal} Internal · ${counts.polymarket} Poly · ${counts.kalshi ?? 0} Kalshi · ${counts.sp500_dynamic ?? 0} S&P 500`
            : sectionSubtitle(source)
        }
        action={
          <Link
            href={viewAllHref}
            className="text-xs font-medium text-accent transition-opacity hover:opacity-80"
          >
            View all
          </Link>
        }
      />
      <CardBody className="flex flex-col gap-4">
        <MarketSourceToggle className="w-full sm:w-auto" value={source} onChange={setSource} />

        {isLoading ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className={cn("h-56 animate-pulse rounded-card border border-edge bg-surface-2")}
              />
            ))}
          </div>
        ) : null}

        {isError ? <p className="py-6 text-center text-sm text-down">{payload.error}</p> : null}

        {!isLoading && events.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {events.map((event) => (
              <LiveEventCard key={event.id} event={event} />
            ))}
          </div>
        ) : null}

        {!isLoading && !isError && events.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">No live events to show.</p>
        ) : null}

        {refreshing ? (
          <p className="text-center text-[11px] text-faint">Refreshing live event feed…</p>
        ) : null}
      </CardBody>
    </Card>
  );
}

export function LiveEventsSection() {
  return (
    <Suspense
      fallback={<div className="h-64 animate-pulse rounded-card border border-edge bg-surface" />}
    >
      <LiveEventsSectionBody />
    </Suspense>
  );
}
