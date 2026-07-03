import { cn } from "@/lib/utils";

export function Progress({
  value,
  tone = "accent",
  className,
}: {
  /** Percentage in [0, 100]. */
  value: number;
  tone?: "accent" | "up" | "down" | "warn";
  className?: string;
}) {
  const clamped = Math.min(100, Math.max(0, value));
  const toneClass = {
    accent: "bg-accent",
    up: "bg-up",
    down: "bg-down",
    warn: "bg-warn",
  }[tone];

  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-surface-3", className)}>
      <div
        className={cn("h-full rounded-full transition-[width] duration-500", toneClass)}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
