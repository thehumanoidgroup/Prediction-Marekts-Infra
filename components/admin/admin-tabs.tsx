"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/challenges", label: "Challenge rules" },
  { href: "/admin/challenge-templates", label: "Challenge Rules by Model Type" },
  { href: "/admin/provisioning", label: "Provisioning" },
  { href: "/admin/traders", label: "Traders" },
  { href: "/admin/accounts", label: "Accounts" },
  { href: "/admin/branding", label: "Branding" },
  { href: "/admin/markets", label: "Market templates" },
];

/** Horizontal sub-navigation for the firm admin area (works on mobile). */
export function AdminTabs() {
  const pathname = usePathname();
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="flex w-max gap-2 border-b border-edge pb-px">
        {tabs.map((tab) => {
          const active =
            tab.href === "/admin" ? pathname === "/admin" : pathname.startsWith(tab.href);
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
