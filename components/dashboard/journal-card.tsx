import Link from "next/link";
import type { JournalEntry } from "@/lib/types";
import { formatCents, formatDateTime, formatShares, formatSignedUsd } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { NoteComposer } from "@/components/dashboard/note-composer";
import { cn } from "@/lib/utils";

/** Dashboard journal section: quick note composer + latest entries. */
export function JournalCard({ entries }: { entries: JournalEntry[] }) {
  return (
    <Card>
      <CardHeader
        title="Trading journal"
        subtitle="Notes and recent activity"
        action={
          <Link
            href="/journal"
            className="text-xs font-medium text-accent transition-opacity hover:opacity-80"
          >
            Full journal
          </Link>
        }
      />
      <CardBody className="flex flex-col gap-3">
        <NoteComposer />
        <ul className="divide-y divide-edge/60">
          {entries.map((entry) => {
            const up = (entry.pnl ?? 0) >= 0;
            return (
              <li key={entry.id} className="flex items-start justify-between gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {entry.kind === "trade" && entry.side && entry.outcome ? (
                      <Badge tone={entry.outcome === "yes" ? "up" : "down"}>
                        {entry.side.toUpperCase()} {entry.outcome.toUpperCase()}
                      </Badge>
                    ) : (
                      <Badge>NOTE</Badge>
                    )}
                    {entry.shares !== null && entry.price !== null ? (
                      <span className="tabular text-[11px] text-muted">
                        {formatShares(entry.shares)} @ {formatCents(entry.price)}
                      </span>
                    ) : null}
                    <span className="text-[11px] text-faint">
                      {formatDateTime(entry.executedAt)}
                    </span>
                  </div>
                  {entry.marketId && entry.marketQuestion ? (
                    <Link
                      href={`/markets/${entry.marketId}`}
                      className="mt-1 line-clamp-1 block text-[13px] font-medium text-foreground transition-colors hover:text-accent"
                    >
                      {entry.marketQuestion}
                    </Link>
                  ) : null}
                  {entry.note ? (
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">
                      {entry.note}
                    </p>
                  ) : null}
                </div>
                {entry.kind === "trade" && entry.pnl !== null ? (
                  <span className={cn("tabular text-xs font-bold", up ? "text-up" : "text-down")}>
                    {formatSignedUsd(entry.pnl)}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      </CardBody>
    </Card>
  );
}
