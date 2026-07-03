import type { PricePoint } from "@/lib/types";

/** Tiny inline SVG price chart used on market cards and tables. */
export function Sparkline({
  data,
  width = 96,
  height = 32,
  positive,
}: {
  data: PricePoint[];
  width?: number;
  height?: number;
  /** Overrides trend color; defaults to first-vs-last comparison. */
  positive?: boolean;
}) {
  if (data.length < 2) return null;

  const values = data.map((d) => d.p);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pad = 2;

  const points = data
    .map((d, i) => {
      const x = pad + (i / (data.length - 1)) * (width - pad * 2);
      const y = pad + (1 - (d.p - min) / range) * (height - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const isUp = positive ?? values[values.length - 1] >= values[0];
  const color = isUp ? "var(--color-up)" : "var(--color-down)";

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="shrink-0"
      aria-hidden
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
