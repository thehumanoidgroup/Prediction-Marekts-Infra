"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { TenantConfig } from "@/lib/tenants";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PRESET_ACCENTS = [
  "#22c55e", // green
  "#38bdf8", // sky
  "#a78bfa", // violet
  "#f59e0b", // amber
  "#f43f5e", // rose
  "#2dd4bf", // teal
];

/** Derives hover/soft/foreground shades from a single accent color. */
function deriveAccentSet(accent: string) {
  const hex = accent.replace("#", "");
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const darken = (v: number) => Math.max(0, Math.round(v * 0.82));
  const toHex = (v: number) => v.toString(16).padStart(2, "0");
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return {
    accent,
    accentHover: `#${toHex(darken(r))}${toHex(darken(g))}${toHex(darken(b))}`,
    accentSoft: `rgba(${r}, ${g}, ${b}, 0.12)`,
    accentForeground: luminance > 0.55 ? "#0a0d12" : "#ffffff",
  };
}

const MAX_LOGO_BYTES = 1_000_000;

/**
 * White-label branding studio. Everything previews live; saving applies
 * the theme across the whole platform (CSS variables re-derive from the
 * tenant's stored overrides on the next render).
 */
export function BrandingForm({ tenant }: { tenant: TenantConfig }) {
  const router = useRouter();
  const [name, setName] = useState(tenant.name);
  const [tagline, setTagline] = useState(tenant.tagline);
  const [glyph, setGlyph] = useState(tenant.branding.logoGlyph);
  const [accent, setAccent] = useState(tenant.branding.accent);
  const [logoUrl, setLogoUrl] = useState(tenant.branding.logoUrl ?? "");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const derived = deriveAccentSet(accent);

  function onLogoFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setMessage({ ok: false, text: "Logo must be an image file" });
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setMessage({ ok: false, text: "Logo must be under 1MB" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setLogoUrl(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function save() {
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/tenant", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          tagline: tagline.trim(),
          branding: {
            ...derived,
            logoGlyph: glyph.trim().slice(0, 2).toUpperCase() || "P",
            logoUrl,
          },
        }),
      });
      if (!response.ok) {
        const body = await response.json();
        setMessage({ ok: false, text: body.error ?? "Save failed" });
        return;
      }
      setMessage({ ok: true, text: "Branding saved — theme applied platform-wide" });
      router.refresh();
    } catch {
      setMessage({ ok: false, text: "Network error — try again" });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {/* Controls */}
      <div className="flex flex-col gap-4">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted">Firm name</span>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={120}
            className="h-10 w-full rounded-lg border border-edge bg-surface-2 px-3 text-sm font-medium text-foreground outline-none transition-colors focus:border-edge-strong"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-muted">Tagline</span>
          <input
            type="text"
            value={tagline}
            onChange={(event) => setTagline(event.target.value)}
            maxLength={255}
            className="h-10 w-full rounded-lg border border-edge bg-surface-2 px-3 text-sm text-foreground outline-none transition-colors focus:border-edge-strong"
          />
        </label>

        <div>
          <span className="mb-1.5 block text-xs font-medium text-muted">Accent color</span>
          <div className="flex flex-wrap items-center gap-2">
            {PRESET_ACCENTS.map((color) => (
              <button
                key={color}
                type="button"
                aria-label={`Use ${color}`}
                onClick={() => setAccent(color)}
                className={cn(
                  "size-8 rounded-full border-2 transition-transform hover:scale-110",
                  accent.toLowerCase() === color ? "border-foreground" : "border-transparent",
                )}
                style={{ backgroundColor: color }}
              />
            ))}
            <label className="flex h-8 cursor-pointer items-center gap-2 rounded-lg border border-edge bg-surface-2 px-2.5 text-xs text-muted transition-colors hover:text-foreground">
              <input
                type="color"
                value={accent}
                onChange={(event) => setAccent(event.target.value)}
                className="size-4 cursor-pointer border-0 bg-transparent p-0"
              />
              Custom
              <code className="text-[10px] text-faint">{accent}</code>
            </label>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">
              Logo glyph (fallback)
            </span>
            <input
              type="text"
              value={glyph}
              onChange={(event) => setGlyph(event.target.value)}
              maxLength={2}
              className="h-10 w-full rounded-lg border border-edge bg-surface-2 px-3 text-sm font-semibold text-foreground outline-none transition-colors focus:border-edge-strong"
            />
          </label>
          <div>
            <span className="mb-1.5 block text-xs font-medium text-muted">Logo upload</span>
            <div className="flex items-center gap-2">
              <label className="flex h-10 flex-1 cursor-pointer items-center justify-center rounded-lg border border-dashed border-edge-strong bg-surface-2 text-xs font-medium text-muted transition-colors hover:text-foreground">
                {logoUrl ? "Replace image" : "Upload image"}
                <input type="file" accept="image/*" onChange={onLogoFile} className="sr-only" />
              </label>
              {logoUrl ? (
                <button
                  type="button"
                  onClick={() => setLogoUrl("")}
                  className="h-10 rounded-lg border border-edge px-3 text-xs text-muted transition-colors hover:text-down"
                >
                  Remove
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 border-t border-edge pt-4">
          <Button onClick={save} disabled={pending || !name.trim()}>
            {pending ? "Saving…" : "Save branding"}
          </Button>
          {message ? (
            <p className={cn("text-xs font-medium", message.ok ? "text-up" : "text-down")}>
              {message.text}
            </p>
          ) : null}
        </div>
      </div>

      {/* Live preview */}
      <div className="rounded-card border border-edge bg-background p-4">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-faint">
          Live preview
        </p>
        <div className="rounded-card border border-edge bg-surface p-4">
          <div className="flex items-center gap-2.5">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- local data URL preview
              <img src={logoUrl} alt="" className="size-9 rounded-lg object-cover" />
            ) : (
              <span
                className="flex size-9 items-center justify-center rounded-lg text-sm font-bold"
                style={{ backgroundColor: derived.accent, color: derived.accentForeground }}
              >
                {glyph.trim().slice(0, 2).toUpperCase() || "P"}
              </span>
            )}
            <div>
              <p className="text-sm font-semibold">{name || "Firm name"}</p>
              <p className="text-xs text-muted">{tagline || "Tagline"}</p>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <span
              className="rounded-lg px-4 py-2 text-xs font-semibold"
              style={{ backgroundColor: derived.accent, color: derived.accentForeground }}
            >
              Start challenge
            </span>
            <span
              className="rounded-lg px-4 py-2 text-xs font-semibold"
              style={{ backgroundColor: derived.accentSoft, color: derived.accent }}
            >
              View markets
            </span>
          </div>
          <div className="mt-4 rounded-lg border border-edge bg-surface-2 p-3">
            <div className="flex justify-between text-xs">
              <span className="text-muted">Profit target</span>
              <span className="tabular font-semibold">$2,500 / $2,500</span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
              <div
                className="h-full w-3/4 rounded-full"
                style={{ backgroundColor: derived.accent }}
              />
            </div>
          </div>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-faint">
          Saving applies this theme to every page your traders see — colors cascade through CSS
          variables, no code changes.
        </p>
      </div>
    </div>
  );
}
