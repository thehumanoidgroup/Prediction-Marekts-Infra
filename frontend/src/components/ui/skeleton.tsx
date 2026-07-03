import { cn } from "@/lib/utils";

/** Pulsing placeholder for loading states. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-shimmer rounded-md bg-surface-3", className)} />;
}
