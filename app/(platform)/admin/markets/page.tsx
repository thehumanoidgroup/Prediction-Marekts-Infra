import Link from "next/link";
import { listMarkets } from "@/lib/services";
import { formatCompactUsd, formatDate, formatTimeUntil } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { MarketForm } from "@/components/admin/market-form";

export default async function AdminMarketsPage() {
  // Newest markets first — admin-created markets carry the `-c` suffix.
  const markets = listMarkets({ sort: "volume" });
  const adminCreated = markets.filter((m) => m.id.endsWith("-c"));
  const listed = [...adminCreated, ...markets.filter((m) => !m.id.endsWith("-c"))].slice(0, 12);

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Card className="self-start xl:col-span-2">
        <CardHeader
          title="Create market from template"
          subtitle="New markets are instantly tradable by your traders"
        />
        <CardBody>
          <MarketForm />
        </CardBody>
      </Card>

      <Card className="self-start">
        <CardHeader
          title="Listed markets"
          subtitle={`${markets.length} live · ${adminCreated.length} created by your firm`}
        />
        <CardBody>
          <ul className="divide-y divide-edge/60">
            {listed.map((market) => (
              <li key={market.id} className="py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <Link
                    href={`/markets/${market.id}`}
                    className="line-clamp-2 text-[13px] font-medium text-foreground transition-colors hover:text-accent"
                  >
                    {market.question}
                  </Link>
                  {market.id.endsWith("-c") ? <Badge tone="accent">Yours</Badge> : null}
                </div>
                <p className="mt-1 text-[11px] text-faint">
                  {Math.round(market.yesPrice * 100)}% · {formatCompactUsd(market.volume)} vol ·
                  closes {formatDate(market.closesAt)} ({formatTimeUntil(market.closesAt)})
                </p>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
