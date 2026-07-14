import { cn } from "@/lib/utils";

/** Visual YES/NO probability split — common on prediction market UIs. */
export function ProbabilityBar({
  yesPrice,
  className,
  size = "md",
}: {
  /** YES probability in [0, 1]. */
  yesPrice: number;
  className?: string;
  size?: "sm" | "md";
}) {
  const yesPct = Math.round(Math.min(97, Math.max(3, yesPrice * 100)));
  const noPct = 100 - yesPct;

  return (
    <div className={cn("w-full", className)}>
      <div
        className={cn(
          "flex overflow-hidden rounded-full bg-surface-3",
          size === "sm" ? "h-1" : "h-1.5",
        )}
      >
        <div
          className="bg-up transition-[width] duration-300"
          style={{ width: `${yesPct}%` }}
        />
        <div
          className="bg-down transition-[width] duration-300"
          style={{ width: `${noPct}%` }}
        />
      </div>
      <div
        className={cn(
          "mt-1 flex justify-between tabular font-medium",
          size === "sm" ? "text-[10px]" : "text-[11px]",
        )}
      >
        <span className="text-up">Yes {yesPct}%</span>
        <span className="text-down">No {noPct}%</span>
      </div>
    </div>
  );
}
