"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { notifyPortfolioRefresh } from "@/hooks/use-dashboard-data";
import type { EnrichedPosition } from "@/lib/services";
import { useLivePrice, useLivePricesMap } from "@/lib/live-prices";
import {
  filterOpenPositions,
  formatStrikeOutcome,
  markPosition,
  marketStatusLabel,
  summarizeLivePositions,
  type PositionProviderFilter,
  type PositionTenorFilter,
} from "@/lib/portfolio-positions";
import type { MarketSourceType, PortfolioSummary } from "@/lib/types";
import {
  formatCents,
  formatPct,
  formatShares,
  formatSignedPct,
  formatSignedUsd,
  formatUsd,
  formatUsdPrecise,
} from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { MarketSourceBadge } from "@/components/markets/market-source-badge";
import { FeedStatusDot } from "@/components/markets/live-price";
import { cn } from "@/lib/utils";

const TENOR_FILTERS: { id: PositionTenorFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "0dte", label: "0DTE" },
  { id: "weekly", label: "Weekly" },
];

const PROVIDER_FILTERS: { id: PositionProviderFilter; label: string }[] = [
  { id: "all", label: "All providers" },
  { id: "internal", label: "Internal" },
  { id: "polymarket", label: "Polymarket" },
  { id: "kalshi", label: "Kalshi" },
  { id: "sp500_dynamic", label: "S&P 500" },
];

function statusTone(status: EnrichedPosition["market"]["status"]): "up" | "warn" | "neutral" {
  if (status === "open") return "up";
  if (status === "closing_soon") return "warn";
  return "neutral";
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors",
        active
          ? "bg-surface-3 text-foreground"
          : "text-muted hover:bg-surface-2 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function ClosePositionButton({
  position,
  yesPrice,
  compact = false,
}: {
  position: EnrichedPosition;
  yesPrice: number;
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canClose = position.market.status !== "resolved" && position.shares > 0;

  async function closePosition() {
    if (!canClose || pending) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marketId: position.marketId,
          outcome: position.outcome,
          side: "sell",
          shares: position.shares,
          yesPrice,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body.detail ?? body.error ?? "Close failed");
        return;
      }
      notifyPortfolioRefresh();
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={cn("flex flex-col items-stretch gap-1", compact ? "" : "items-end")}>
      <div className="flex items-center gap-1.5">
        <Button
          type="button"
          variant="down"
          size="sm"
          disabled={!canClose || pending}
          onClick={() => void closePosition()}
          className={cn(compact && "flex-1")}
        >
          {pending ? "Closing…" : "Close"}
        </Button>
        <Link
          href={`/markets/${position.marketId}`}
          className={cn(
            "inline-flex h-8 items-center justify-center rounded-lg border border-edge-strong bg-surface-2 px-3 text-xs font-medium text-foreground transition-colors hover:bg-surface-3",
            compact && "flex-1",
          )}
        >
          Manage
        </Link>
      </div>
      {error ? <p className="text-[11px] text-down">{error}</p> : null}
    </div>
  );
}

function LivePositionRow({ position }: { position: EnrichedPosition }) {
  const yesPrice = useLivePrice(position.marketId, position.market.yesPrice);
  const marked = markPosition(position, { [position.marketId]: yesPrice });
  const up = marked.pnl >= 0;
  const strike = formatStrikeOutcome(position);

  return (
    <>
      {/* Mobile card */}
      <article className="rounded-xl border border-edge bg-surface-2/60 p-3 md:hidden">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <Link
              href={`/markets/${position.marketId}`}
              className="line-clamp-2 text-sm font-medium leading-snug text-foreground"
            >
              {position.market.question}
            </Link>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <MarketSourceBadge source={position.market.source as MarketSourceType} compact />
              <Badge tone={position.outcome === "yes" ? "up" : "down"}>{strike}</Badge>
              <Badge tone={statusTone(position.market.status)}>
                {marketStatusLabel(position.market.status)}
              </Badge>
            </div>
          </div>
          <span className={cn("tabular shrink-0 text-sm font-bold", up ? "text-up" : "text-down")}>
            {formatSignedUsd(marked.pnl)}
          </span>
        </div>
        <dl className="tabular mt-2.5 grid grid-cols-3 gap-2 text-[11px]">
          <div>
            <dt className="text-faint">Bet size</dt>
            <dd className="font-semibold text-foreground">{formatUsdPrecise(marked.cost)}</dd>
          </div>
          <div>
            <dt className="text-faint">Prob</dt>
            <dd className="font-semibold text-foreground">{formatPct(marked.yesPrice * 100, 0)}</dd>
          </div>
          <div className="text-right">
            <dt className="text-faint">Value</dt>
            <dd className="font-semibold text-foreground">{formatUsdPrecise(marked.value)}</dd>
          </div>
        </dl>
        <div className="mt-3">
          <ClosePositionButton position={position} yesPrice={yesPrice} compact />
        </div>
      </article>

      {/* Desktop row */}
      <tr className="group hidden border-b border-edge/60 last:border-0 hover:bg-surface-2/60 md:table-row">
        <td className="max-w-[220px] py-3 pr-3">
          <Link
            href={`/markets/${position.marketId}`}
            className="line-clamp-2 font-medium text-foreground transition-colors group-hover:text-accent"
          >
            {position.market.question}
          </Link>
        </td>
        <td className="py-3 pr-3">
          <MarketSourceBadge source={position.market.source as MarketSourceType} compact />
        </td>
        <td className="py-3 pr-3">
          <Badge tone={position.outcome === "yes" ? "up" : "down"}>{strike}</Badge>
        </td>
        <td className="tabular py-3 pr-3 text-right text-muted">
          <div className="text-foreground">{formatUsdPrecise(marked.cost)}</div>
          <div className="text-[11px] text-faint">{formatShares(position.shares)} sh</div>
        </td>
        <td className="tabular py-3 pr-3 text-right text-foreground">
          {formatPct(marked.yesPrice * 100, 0)}
          <div className="text-[11px] text-faint">{formatCents(marked.currentPrice)} mark</div>
        </td>
        <td className={cn("tabular py-3 pr-3 text-right font-medium", up ? "text-up" : "text-down")}>
          {formatSignedUsd(marked.pnl)}
          <span className="ml-1.5 text-xs opacity-80">{formatSignedPct(marked.pnlPct)}</span>
        </td>
        <td className="py-3 pr-3">
          <Badge tone={statusTone(position.market.status)}>
            {marketStatusLabel(position.market.status)}
          </Badge>
        </td>
        <td className="py-3 text-right">
          <ClosePositionButton position={position} yesPrice={yesPrice} />
        </td>
      </tr>
    </>
  );
}

export function OpenPositionsPanel({
  positions,
  summary,
  title = "Open positions",
  showTotals = true,
  compactHeader = false,
  className,
}: {
  positions: EnrichedPosition[];
  summary?: Pick<PortfolioSummary, "equity" | "totalPnl" | "openPnl" | "balance">;
  title?: string;
  showTotals?: boolean;
  compactHeader?: boolean;
  className?: string;
}) {
  const [tenor, setTenor] = useState<PositionTenorFilter>("all");
  const [provider, setProvider] = useState<PositionProviderFilter>("all");
  const livePrices = useLivePricesMap();

  const filtered = useMemo(
    () => filterOpenPositions(positions, { tenor, provider }),
    [positions, tenor, provider],
  );

  const sorted = useMemo(
    () =>
      [...filtered].sort((a, b) => {
        const aPnl = markPosition(a, livePrices).pnl;
        const bPnl = markPosition(b, livePrices).pnl;
        return bPnl - aPnl;
      }),
    [filtered, livePrices],
  );

  const liveTotals = useMemo(
    () => summarizeLivePositions(filtered, livePrices),
    [filtered, livePrices],
  );

  const equity = summary?.equity ?? liveTotals.portfolioValue + (summary?.balance ?? 0);
  const overallPnl = summary?.totalPnl ?? liveTotals.openPnl;

  return (
    <Card className={className}>
      <CardHeader
        title={title}
        subtitle={
          compactHeader
            ? `${sorted.length} open · ${formatSignedUsd(liveTotals.openPnl)} unrealized`
            : "Live positions · mark-to-market"
        }
        action={
          <div className="flex items-center gap-2">
            <FeedStatusDot />
            {!compactHeader ? (
              <span className="hidden text-[11px] font-medium text-muted sm:inline">
                Live feed
              </span>
            ) : (
              <Link
                href="/portfolio"
                className="text-xs font-medium text-accent transition-opacity hover:opacity-80"
              >
                My Portfolio
              </Link>
            )}
          </div>
        }
      />
      <CardBody className="flex flex-col gap-4">
        {showTotals ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-lg border border-edge/70 bg-surface-2/50 px-3 py-2.5">
              <p className="text-[11px] font-medium uppercase tracking-wide text-faint">
                Portfolio value
              </p>
              <p className="tabular mt-0.5 text-base font-semibold text-foreground">
                {formatUsd(equity)}
              </p>
            </div>
            <div className="rounded-lg border border-edge/70 bg-surface-2/50 px-3 py-2.5">
              <p className="text-[11px] font-medium uppercase tracking-wide text-faint">
                Positions value
              </p>
              <p className="tabular mt-0.5 text-base font-semibold text-foreground">
                {formatUsdPrecise(liveTotals.portfolioValue)}
              </p>
            </div>
            <div className="rounded-lg border border-edge/70 bg-surface-2/50 px-3 py-2.5">
              <p className="text-[11px] font-medium uppercase tracking-wide text-faint">
                Unrealized P&L
              </p>
              <p
                className={cn(
                  "tabular mt-0.5 text-base font-semibold",
                  liveTotals.openPnl >= 0 ? "text-up" : "text-down",
                )}
              >
                {formatSignedUsd(liveTotals.openPnl)}
              </p>
            </div>
            <div className="rounded-lg border border-edge/70 bg-surface-2/50 px-3 py-2.5">
              <p className="text-[11px] font-medium uppercase tracking-wide text-faint">
                Overall P&L
              </p>
              <p
                className={cn(
                  "tabular mt-0.5 text-base font-semibold",
                  overallPnl >= 0 ? "text-up" : "text-down",
                )}
              >
                {formatSignedUsd(overallPnl)}
              </p>
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <div className="flex gap-1 overflow-x-auto rounded-lg border border-edge bg-surface-2 p-0.5">
            {TENOR_FILTERS.map((item) => (
              <FilterChip key={item.id} active={tenor === item.id} onClick={() => setTenor(item.id)}>
                {item.label}
              </FilterChip>
            ))}
          </div>
          <div className="flex gap-1 overflow-x-auto rounded-lg border border-edge bg-surface-2 p-0.5">
            {PROVIDER_FILTERS.map((item) => (
              <FilterChip
                key={item.id}
                active={provider === item.id}
                onClick={() => setProvider(item.id)}
              >
                {item.label}
              </FilterChip>
            ))}
          </div>
        </div>

        {sorted.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-sm text-muted">
              {positions.length === 0
                ? "No open positions. Find a market to trade."
                : "No positions match these filters."}
            </p>
            {positions.length === 0 ? (
              <Link
                href="/markets"
                className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-hover"
              >
                Browse markets
              </Link>
            ) : (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setTenor("all");
                  setProvider("all");
                }}
              >
                Clear filters
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2.5 md:hidden">
              {sorted.map((position) => (
                <LivePositionRow key={position.id} position={position} />
              ))}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[920px] text-sm">
                <thead>
                  <tr className="border-b border-edge text-left text-[11px] uppercase tracking-wide text-faint">
                    <th className="pb-2 pr-3 font-medium">Event</th>
                    <th className="pb-2 pr-3 font-medium">Provider</th>
                    <th className="pb-2 pr-3 font-medium">Strike / Outcome</th>
                    <th className="tabular pb-2 pr-3 text-right font-medium">Bet size</th>
                    <th className="tabular pb-2 pr-3 text-right font-medium">Prob</th>
                    <th className="tabular pb-2 pr-3 text-right font-medium">Unrealized P&L</th>
                    <th className="pb-2 pr-3 font-medium">Status</th>
                    <th className="pb-2 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((position) => (
                    <LivePositionRow key={position.id} position={position} />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}
