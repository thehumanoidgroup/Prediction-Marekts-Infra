"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType, SVGProps } from "react";
import { cn } from "@/lib/utils";
import {
  IconDashboard,
  IconJournal,
  IconMarkets,
  IconPortfolio,
  IconSettings,
  IconTrophy,
} from "@/components/ui/icons";

export interface NavItem {
  href: string;
  label: string;
  icon: string;
}

const iconMap: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = {
  dashboard: IconDashboard,
  markets: IconMarkets,
  portfolio: IconPortfolio,
  journal: IconJournal,
  trophy: IconTrophy,
  settings: IconSettings,
};

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const Icon = iconMap[item.icon];
        const active = isActive(pathname, item.href);
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
    </nav>
  );
}

export function MobileNavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="grid h-16 auto-cols-fr grid-flow-col">
      {items.map((item) => {
        const Icon = iconMap[item.icon];
        const active = isActive(pathname, item.href);
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
