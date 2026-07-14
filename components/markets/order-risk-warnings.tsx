import type { OrderRiskPreview } from "@/lib/types";
import { formatUsdPrecise } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Inline warnings when a proposed order would breach challenge rules. */
export function OrderRiskWarnings({
  preview,
  loading,
  className,
}: {
  preview: OrderRiskPreview | null;
  loading?: boolean;
  className?: string;
}) {
  if (loading && !preview) {
    return (
      <p className={cn("text-[11px] text-faint", className)}>Checking challenge rules…</p>
    );
  }

  if (!preview) return null;

  if (preview.challengeStatus && preview.challengeStatus !== "active") {
    return (
      <div
        className={cn(
          "rounded-lg border border-down/30 bg-down-soft px-3 py-2 text-xs font-medium text-down",
          className,
        )}
      >
        Challenge is {preview.challengeStatus} — trading is closed.
      </div>
    );
  }

  if (preview.allowed) {
    if (
      preview.side === "buy" &&
      preview.maxStakePerOrder &&
      preview.stake > preview.maxStakePerOrder * 0.8
    ) {
      return (
        <p className={cn("text-xs text-warn", className)}>
          Stake {formatUsdPrecise(preview.stake)} is close to the{" "}
          {formatUsdPrecise(preview.maxStakePerOrder)} per-pick limit.
        </p>
      );
    }
    return null;
  }

  return (
    <div
      className={cn(
        "rounded-lg border border-down/30 bg-down-soft px-3 py-2 text-xs font-medium text-down",
        className,
      )}
    >
      <p className="font-semibold">This trade would breach challenge rules</p>
      <ul className="mt-1 list-inside list-disc space-y-0.5">
        {preview.reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
    </div>
  );
}
