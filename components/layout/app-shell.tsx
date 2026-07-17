import Link from "next/link";
import type { ReactNode } from "react";
import type { TenantConfig } from "@/lib/tenants";
import { listTenants } from "@/lib/tenants";
import type { ChallengeAccount } from "@/lib/types";
import { formatSignedUsd, formatUsd } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ProviderBadge } from "@/components/ui/provider-badge";
import { FeedStatusDot } from "@/components/markets/live-price";
import { IconBell, IconShield } from "@/components/ui/icons";
import {
  MobileNavLinks,
  SidebarLinks,
  type NavGroup,
  type NavItem,
} from "@/components/layout/nav-links";
import { TenantSwitcher } from "@/components/layout/tenant-switcher";

function navGroups(tenant: TenantConfig): NavGroup[] {
  const trader: NavItem[] = [
    { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
    { href: "/markets", label: "Markets", icon: "markets" },
    { href: "/portfolio", label: "Portfolio", icon: "portfolio" },
  ];
  if (tenant.features.journal) trader.push({ href: "/journal", label: "Journal", icon: "journal" });
  if (tenant.features.leaderboard)
    trader.push({ href: "/leaderboard", label: "Leaderboard", icon: "trophy" });
  trader.push({ href: "/settings", label: "Settings", icon: "settings" });

  // Role-gated to PropFirmAdmin once auth is wired to the backend.
  const admin: NavItem[] = [
    { href: "/admin", label: "Overview", icon: "shield", exact: true },
    { href: "/admin/challenges", label: "Challenge rules", icon: "sliders" },
    { href: "/admin/challenge-templates", label: "Model templates", icon: "sliders" },
    { href: "/admin/traders", label: "Traders", icon: "users" },
    { href: "/admin/accounts", label: "Accounts", icon: "shield" },
    { href: "/admin/branding", label: "Branding", icon: "palette" },
    { href: "/admin/markets", label: "Market templates", icon: "markets" },
  ];

  const platform: NavItem[] = [
    { href: "/platform", label: "Overview", icon: "globe", exact: true },
    { href: "/platform/firms", label: "All firms", icon: "users" },
    { href: "/platform/markets", label: "Global templates", icon: "markets" },
    { href: "/platform/sold-accounts", label: "Sold accounts", icon: "shield" },
  ];

  return [{ items: trader }, { label: "Firm admin", items: admin }, { label: "Platform", items: platform }];
}

function Logo({ tenant }: { tenant: TenantConfig }) {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      {tenant.branding.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- data URLs from the branding studio
        <img
          src={tenant.branding.logoUrl}
          alt=""
          className="size-8 rounded-lg object-cover"
        />
      ) : (
        <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-sm font-bold text-accent-foreground">
          {tenant.branding.logoGlyph}
        </span>
      )}
      <span className="text-[15px] font-semibold tracking-tight">{tenant.name}</span>
    </Link>
  );
}

const phaseLabels: Record<ChallengeAccount["phase"], string> = {
  evaluation: "Evaluation",
  verification: "Verification",
  funded: "Funded",
};

export function AppShell({
  tenant,
  account,
  children,
}: {
  tenant: TenantConfig;
  account: ChallengeAccount;
  children: ReactNode;
}) {
  const groups = navGroups(tenant);
  const mobileItems: NavItem[] = [
    ...groups[0].items.filter((item) => item.href !== "/settings").slice(0, 4),
    { href: "/admin", label: "Admin", icon: "shield" },
  ];
  const dailyUp = account.dailyPnl >= 0;

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-edge bg-surface px-4 py-5 lg:flex">
        <Logo tenant={tenant} />
        <div className="mt-6 flex-1 overflow-y-auto">
          <SidebarLinks groups={groups} />
        </div>
        <div className="rounded-card border border-edge bg-surface-2 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium text-muted">{account.label}</span>
            <div className="flex items-center gap-1.5">
              <ProviderBadge provider={account.provider} compact />
              <Badge tone="accent">
                <IconShield className="text-xs" />
                {phaseLabels[account.phase]}
              </Badge>
            </div>
          </div>
          <p className="tabular mt-2 text-lg font-semibold">{formatUsd(account.equity)}</p>
          <p className={cn("tabular text-xs font-medium", dailyUp ? "text-up" : "text-down")}>
            {formatSignedUsd(account.dailyPnl)} today
          </p>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-60">
        {/* Topbar */}
        <header className="sticky top-0 z-20 border-b border-edge bg-background/80 backdrop-blur-md">
          <div className="flex h-14 items-center justify-between gap-3 px-4 sm:px-6">
            <div className="flex items-center gap-3 lg:hidden">
              <Logo tenant={tenant} />
            </div>
            <div className="hidden items-center gap-2 lg:flex">
              <FeedStatusDot />
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="tabular hidden items-baseline gap-2 rounded-lg border border-edge bg-surface px-3 py-1.5 text-xs sm:flex">
                <span className="text-muted">Equity</span>
                <span className="font-semibold text-foreground">{formatUsd(account.equity)}</span>
                <span className={cn("font-medium", dailyUp ? "text-up" : "text-down")}>
                  {formatSignedUsd(account.dailyPnl)}
                </span>
              </div>
              <TenantSwitcher
                current={tenant.id}
                tenants={listTenants().map(({ id, name }) => ({ id, name }))}
              />
              <button
                type="button"
                aria-label="Notifications"
                className="flex size-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
              >
                <IconBell className="text-[18px]" />
              </button>
              <span className="flex size-8 items-center justify-center rounded-full bg-surface-3 text-xs font-semibold text-foreground">
                JT
              </span>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 pb-24 pt-5 sm:px-6 lg:pb-8">{children}</main>
      </div>

      {/* Mobile bottom nav */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-edge bg-surface/95 backdrop-blur-md lg:hidden">
        <MobileNavLinks items={mobileItems} />
      </div>
    </div>
  );
}
