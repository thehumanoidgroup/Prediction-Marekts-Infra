"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/platform", label: "Overview" },
  { href: "/platform/firms", label: "All firms" },
  { href: "/platform/markets", label: "Global templates" },
];

/** Horizontal sub-navigation for the platform owner area. */
export function PlatformTabs() {
  const pathname = usePathname();
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="flex w-max gap-2 border-b border-edge pb-px">
        {tabs.map((tab) => {
          const active =
            tab.href === "/platform" ? pathname === "/platform" : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "border-accent text-accent"
                  : "border-transparent text-muted hover:text-foreground",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
