import type { SVGProps } from "react";

/** Minimal stroke icon set (24x24 viewBox, 1.7px stroke) — no icon dependency. */

function Icon({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      width="1em"
      height="1em"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  );
}

export function IconDashboard(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="3" y="3" width="7.5" height="9" rx="1.5" />
      <rect x="13.5" y="3" width="7.5" height="5.5" rx="1.5" />
      <rect x="13.5" y="12" width="7.5" height="9" rx="1.5" />
      <rect x="3" y="15.5" width="7.5" height="5.5" rx="1.5" />
    </Icon>
  );
}

export function IconMarkets(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M3 17l5.5-5.5 3.5 3.5L21 6.5" />
      <path d="M15.5 6.5H21V12" />
    </Icon>
  );
}

export function IconPortfolio(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8 7V5.5A1.5 1.5 0 019.5 4h5A1.5 1.5 0 0116 5.5V7" />
      <path d="M3 12h18" />
    </Icon>
  );
}

export function IconJournal(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M5 4.5A1.5 1.5 0 016.5 3H19v18H6.5A1.5 1.5 0 015 19.5z" />
      <path d="M9 8h6M9 12h6" />
    </Icon>
  );
}

export function IconTrophy(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M8 4h8v6a4 4 0 01-8 0z" />
      <path d="M8 5H4.5v1.5A3.5 3.5 0 008 10M16 5h3.5v1.5A3.5 3.5 0 0116 10" />
      <path d="M12 14v3M8.5 20h7M10 17h4v3h-4z" />
    </Icon>
  );
}

export function IconSettings(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 00.34 1.87l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.7 1.7 0 00-1.87-.34 1.7 1.7 0 00-1.04 1.56V21a2 2 0 11-4 0v-.09a1.7 1.7 0 00-1.04-1.56 1.7 1.7 0 00-1.87.34l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.7 1.7 0 00.34-1.87 1.7 1.7 0 00-1.56-1.04H3a2 2 0 110-4h.09a1.7 1.7 0 001.56-1.04 1.7 1.7 0 00-.34-1.87l-.06-.06a2 2 0 112.83-2.83l.06.06a1.7 1.7 0 001.87.34h.08a1.7 1.7 0 001.04-1.56V3a2 2 0 114 0v.09a1.7 1.7 0 001.04 1.56h.08a1.7 1.7 0 001.87-.34l.06-.06a2 2 0 112.83 2.83l-.06.06a1.7 1.7 0 00-.34 1.87v.08a1.7 1.7 0 001.56 1.04H21a2 2 0 110 4h-.09a1.7 1.7 0 00-1.56 1.04z" />
    </Icon>
  );
}

export function IconSearch(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.8-3.8" />
    </Icon>
  );
}

export function IconArrowUpRight(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M7 17L17 7M9 7h8v8" />
    </Icon>
  );
}

export function IconArrowDownRight(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M7 7l10 10M17 9v8H9" />
    </Icon>
  );
}

export function IconClock(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </Icon>
  );
}

export function IconUsers(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <circle cx="9" cy="8" r="3.25" />
      <path d="M3.5 19.5a5.5 5.5 0 0111 0" />
      <path d="M15.5 5.4a3.25 3.25 0 010 5.94M17.5 14.6a5.5 5.5 0 013 4.9" />
    </Icon>
  );
}

export function IconChevronDown(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M6 9l6 6 6-6" />
    </Icon>
  );
}

export function IconChevronLeft(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M15 6l-6 6 6 6" />
    </Icon>
  );
}

export function IconMenu(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Icon>
  );
}

export function IconClose(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Icon>
  );
}

export function IconBell(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M6 9.5a6 6 0 0112 0c0 4 1.5 5.5 1.5 5.5h-15S6 13.5 6 9.5" />
      <path d="M10 18.5a2 2 0 004 0" />
    </Icon>
  );
}

export function IconShield(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M12 3l7.5 3v5.5c0 4.5-3 7.8-7.5 9.5-4.5-1.7-7.5-5-7.5-9.5V6z" />
      <path d="M9 12l2 2 4-4.5" />
    </Icon>
  );
}

export function IconCheck(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </Icon>
  );
}
