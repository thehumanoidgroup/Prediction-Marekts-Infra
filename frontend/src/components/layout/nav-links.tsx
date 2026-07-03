"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType, SVGProps } from "react";
import { cn } from "@/lib/utils";
import {
  IconDashboard,
  IconGlobe,
  IconJournal,
  IconMarkets,
  IconPalette,
  IconPortfolio,
  IconSettings,
  IconShield,
  IconSliders,
  IconTrophy,
  IconUsers,
} from "@/components/ui/icons";

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  /** Highlight only on an exact path match (e.g. section index pages). */
  exact?: boolean;
}

export interface NavGroup {
  label?: string;
  items: NavItem[];
}

const iconMap: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = {
  dashboard: IconDashboard,
  markets: IconMarkets,
  portfolio: IconPortfolio,
  journal: IconJournal,
  trophy: IconTrophy,
  settings: IconSettings,
  shield: IconShield,
  users: IconUsers,
  sliders: IconSliders,
  palette: IconPalette,
  globe: IconGlobe,
};

function isActive(pathname: string, item: NavItem): boolean {
  if (item.exact || item.href === "/") return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function SidebarLinks({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-4">
      {groups.map((group, index) => (
        <div key={group.label ?? index}>
          {group.label ? (
            <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-faint">
              {group.label}
            </p>
          ) : null}
          <div className="flex flex-col gap-1">
            {group.items.map((item) => {
              const Icon = iconMap[item.icon];
              const active = isActive(pathname, item);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-accent-soft font-medium text-accent"
                      : "text-muted hover:bg-surface-2 hover:text-foreground",
                  )}
                >
                  <Icon className="text-[18px]" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

export function MobileNavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="grid h-16 auto-cols-fr grid-flow-col">
      {items.map((item) => {
        const Icon = iconMap[item.icon];
        const active = isActive(pathname, item);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors",
              active ? "text-accent" : "text-muted",
            )}
          >
            <Icon className="text-[20px]" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
