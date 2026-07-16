import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getHybridMarket } from "@/lib/hybrid-markets";
import { hydrateTenantPortfolio } from "@/lib/portfolio-persistence";
import { getRequestTenant } from "@/lib/tenant-server";
import { getAccount, getPositions } from "@/lib/services";
import {
  formatCents,
  formatCompactUsd,
  formatDate,
  formatShares,
  formatSignedUsd,
  formatTimeUntil,
} from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { IconChevronLeft, IconClock, IconUsers } from "@/components/ui/icons";
import { PriceChart } from "@/components/charts/price-chart";
import { LiveProbability } from "@/components/markets/live-price";
import { TradePanel } from "@/components/markets/trade-panel";
import { cn } from "@/lib/utils";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const market = await getHybridMarket(id);
  return { title: market?.question ?? "Market" };
}

export default async function MarketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const market = await getHybridMarket(id);
  if (!market) notFound();

  const tenant = await getRequestTenant();
  await hydrateTenantPortfolio(tenant.id);
  const account = getAccount(tenant.id);
  const positions = getPositions(tenant.id).filter((p) => p.marketId === market.id);
  const up = market.change24h >= 0;

  const stats = [
    { label: "24h volume", value: formatCompactUsd(market.volume24h) },
    { label: "Total volume", value: formatCompactUsd(market.volume) },
    { label: "Open interest", value: formatCompactUsd(market.openInterest) },
    { label: "Traders", value: market.traders.toLocaleString() },
  ];

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4">
      <Link
        href="/markets"
        className="flex w-fit items-center gap-1 text-xs font-medium text-muted transition-colors hover:text-foreground"
      >
        <IconChevronLeft className="text-sm" />
        All markets
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Badge>{market.category}</Badge>
            {market.status === "closing_soon" ? <Badge tone="warn">Closing soon</Badge> : null}
            <span className="flex items-center gap-1 text-[11px] text-faint">
              <IconClock className="text-sm" />
              Closes {formatDate(market.closesAt)} ({formatTimeUntil(market.closesAt)})
            </span>
          </div>
          <h1 className="mt-2 max-w-2xl text-lg font-semibold leading-snug tracking-tight sm:text-xl">
            {market.question}
          </h1>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-medium text-faint">YES probability</p>
          <div className="flex items-baseline justify-end gap-2">
            <LiveProbability
              marketId={market.id}
              initialPrice={market.yesPrice}
              className="text-3xl font-bold tracking-tight"
            />
            <span className={cn("tabular text-sm font-semibold", up ? "text-up" : "text-down")}>
              {up ? "+" : "−"}
              {Math.abs(Math.round(market.change24h * 100))}¢ 24h
            </span>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Chart + stats */}
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card>
            <CardHeader title="Price history" subtitle="YES share price, 30 days" />
            <CardBody>
              <PriceChart data={market.history} />
            </CardBody>
          </Card>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {stats.map((stat) => (
              <Card key={stat.label}>
                <CardBody className="pt-4">
                  <p className="text-[11px] font-medium text-faint">{stat.label}</p>
                  <p className="tabular mt-1 text-lg font-semibold">{stat.value}</p>
                </CardBody>
              </Card>
            ))}
          </div>

          {positions.length > 0 ? (
            <Card>
              <CardHeader title="Your position" />
              <CardBody className="flex flex-col gap-3">
                {positions.map((position) => (
                  <div
                    key={position.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-surface-2 px-3 py-2.5 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <Badge tone={position.outcome === "yes" ? "up" : "down"}>
                        {position.outcome.toUpperCase()}
                      </Badge>
                      <span className="tabular text-muted">
                        {formatShares(position.shares)} @ {formatCents(position.avgPrice)}
                      </span>
                    </div>
                    <span
                      className={cn(
                        "tabular font-semibold",
                        position.pnl >= 0 ? "text-up" : "text-down",
                      )}
                    >
                      {formatSignedUsd(position.pnl)}
                    </span>
                  </div>
                ))}
              </CardBody>
            </Card>
          ) : null}
        </div>

        {/* Order ticket */}
        <div className="lg:sticky lg:top-20 lg:self-start">
          <Card>
            <CardHeader
              title="Place order"
              subtitle="Fills instantly at market price"
              action={
                <span className="flex items-center gap-1 text-[11px] text-faint">
                  <IconUsers className="text-sm" />
                  {market.traders.toLocaleString()} trading
                </span>
              }
            />
            <CardBody>
              <TradePanel
                marketId={market.id}
                yesPrice={market.yesPrice}
                balance={account.balance}
                disabled={market.status === "resolved"}
              />
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
