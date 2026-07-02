import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getRequestTenant } from "@/lib/tenant-server";
import { getJournal } from "@/lib/services";
import {
  formatCents,
  formatDateTime,
  formatShares,
  formatSignedUsd,
} from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Journal" };

export default async function JournalPage() {
  const tenant = await getRequestTenant();
  if (!tenant.features.journal) notFound();

  const entries = getJournal(tenant.id);
  const closed = entries.filter((e) => e.pnl !== null);
  const realized = closed.reduce((sum, e) => sum + (e.pnl ?? 0), 0);
  const wins = closed.filter((e) => (e.pnl ?? 0) > 0).length;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Trading journal</h1>
          <p className="mt-0.5 text-sm text-muted">
            {entries.length} entries · {wins}/{closed.length} winners ·{" "}
            <span className={cn("tabular font-medium", realized >= 0 ? "text-up" : "text-down")}>
              {formatSignedUsd(realized)} realized
            </span>
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {entries.map((entry) => {
          const isOpen = entry.pnl === null;
          const up = (entry.pnl ?? 0) >= 0;
          return (
            <Card key={entry.id}>
              <CardBody className="pt-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={entry.outcome === "yes" ? "up" : "down"}>
                        {entry.side.toUpperCase()} {entry.outcome.toUpperCase()}
                      </Badge>
                      <span className="tabular text-xs text-muted">
                        {formatShares(entry.shares)} @ {formatCents(entry.price)}
                      </span>
                      <span className="text-xs text-faint">{formatDateTime(entry.executedAt)}</span>
                    </div>
                    <Link
                      href={`/markets/${entry.marketId}`}
                      className="mt-2 block text-sm font-medium text-foreground transition-colors hover:text-accent"
                    >
                      {entry.marketQuestion}
                    </Link>
                    {entry.note ? (
                      <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{entry.note}</p>
                    ) : null}
                    {entry.tags.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {entry.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-md bg-surface-3 px-1.5 py-0.5 text-[10px] font-medium text-muted"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="text-right">
                    {isOpen ? (
                      <Badge tone="accent">Open</Badge>
                    ) : (
                      <p className={cn("tabular text-sm font-bold", up ? "text-up" : "text-down")}>
                        {formatSignedUsd(entry.pnl ?? 0)}
                      </p>
                    )}
                  </div>
                </div>
              </CardBody>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
