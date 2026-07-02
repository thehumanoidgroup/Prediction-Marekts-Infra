import type { Metadata } from "next";
import { getRequestTenant } from "@/lib/tenant-server";
import { formatCompactUsd, formatPct } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { IconCheck, IconClose } from "@/components/ui/icons";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const tenant = await getRequestTenant();

  const rules = [
    { label: "Profit target", value: formatPct(tenant.program.profitTargetPct, 0) },
    { label: "Max daily loss", value: formatPct(tenant.program.maxDailyLossPct, 0) },
    { label: "Max drawdown", value: formatPct(tenant.program.maxDrawdownPct, 0) },
    { label: "Profit split", value: formatPct(tenant.program.profitSplitPct, 0) },
  ];

  const features = [
    { label: "Trader leaderboard", enabled: tenant.features.leaderboard },
    { label: "Trading journal", enabled: tenant.features.journal },
    { label: "Automated payouts", enabled: tenant.features.payouts },
  ];

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-0.5 text-sm text-muted">
          Workspace configuration for {tenant.name}
        </p>
      </div>

      <Card>
        <CardHeader
          title="White-label branding"
          subtitle="Resolved per request from the firm's subdomain"
          action={<Badge tone="accent">{tenant.slug}.proppredict.com</Badge>}
        />
        <CardBody className="flex flex-wrap items-center gap-4">
          <span className="flex size-14 items-center justify-center rounded-xl bg-accent text-xl font-bold text-accent-foreground">
            {tenant.branding.logoGlyph}
          </span>
          <div>
            <p className="text-base font-semibold">{tenant.name}</p>
            <p className="text-sm text-muted">{tenant.tagline}</p>
            <div className="mt-2 flex items-center gap-2">
              <span
                className="size-4 rounded-full border border-edge-strong"
                style={{ backgroundColor: tenant.branding.accent }}
              />
              <code className="text-xs text-muted">{tenant.branding.accent}</code>
              <span className="text-xs text-faint">accent color</span>
            </div>
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader title="Challenge rules" subtitle="Applied to every evaluation" />
          <CardBody>
            <dl className="divide-y divide-edge/60">
              {rules.map((rule) => (
                <div key={rule.label} className="flex items-center justify-between py-2.5 text-sm">
                  <dt className="text-muted">{rule.label}</dt>
                  <dd className="tabular font-semibold">{rule.value}</dd>
                </div>
              ))}
              <div className="flex items-center justify-between py-2.5 text-sm">
                <dt className="text-muted">Account sizes</dt>
                <dd className="tabular font-semibold">
                  {tenant.program.accountSizes.map((size) => formatCompactUsd(size)).join(" · ")}
                </dd>
              </div>
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Platform features" subtitle="Toggled per firm" />
          <CardBody>
            <ul className="divide-y divide-edge/60">
              {features.map((feature) => (
                <li key={feature.label} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="text-muted">{feature.label}</span>
                  {feature.enabled ? (
                    <Badge tone="up">
                      <IconCheck className="text-xs" /> Enabled
                    </Badge>
                  ) : (
                    <Badge>
                      <IconClose className="text-xs" /> Disabled
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>

      <p className="text-xs leading-relaxed text-faint">
        Branding, rules and features are served from the tenant registry and applied per request —
        every firm on this deployment gets its own domain, colors and program without code changes.
      </p>
    </div>
  );
}
