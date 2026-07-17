"use client";

import type { ChallengeWarning } from "@/lib/challenge-warnings";
import { cn } from "@/lib/utils";

const TONE_STYLES: Record<
  ChallengeWarning["tone"],
  { border: string; bg: string; title: string; detail: string }
> = {
  warn: {
    border: "border-warn/40",
    bg: "bg-warn/10",
    title: "text-warn",
    detail: "text-foreground/80",
  },
  down: {
    border: "border-down/40",
    bg: "bg-down-soft/60",
    title: "text-down",
    detail: "text-foreground/80",
  },
  up: {
    border: "border-up/40",
    bg: "bg-up/10",
    title: "text-up",
    detail: "text-foreground/80",
  },
  neutral: {
    border: "border-edge",
    bg: "bg-surface-2",
    title: "text-foreground",
    detail: "text-muted",
  },
};

/** Inline banners that surface challenge-rule proximity on Portfolio. */
export function ChallengeRiskBanners({
  warnings,
  className,
}: {
  warnings: ChallengeWarning[];
  className?: string;
}) {
  if (warnings.length === 0) return null;

  return (
    <div className={cn("flex flex-col gap-2", className)} role="status" aria-live="polite">
      {warnings.map((warning) => {
        const styles = TONE_STYLES[warning.tone];
        return (
          <div
            key={warning.id}
            className={cn(
              "rounded-xl border px-3.5 py-3 sm:px-4",
              styles.border,
              styles.bg,
            )}
          >
            <p className={cn("text-sm font-semibold", styles.title)}>{warning.title}</p>
            <p className={cn("mt-0.5 text-xs leading-relaxed sm:text-sm", styles.detail)}>
              {warning.detail}
            </p>
          </div>
        );
      })}
    </div>
  );
}
