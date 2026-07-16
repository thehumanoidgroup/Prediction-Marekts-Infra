/**
 * US equity session helpers for S&P 500 0DTE / weekly markets (MVP).
 *
 * Official Alpaca docs (pricing only — no free-tier calendar API):
 * - https://alpaca.markets/docs/
 * - https://alpaca.markets/docs/api-references/market-data-api/
 */

const NYSE_HOLIDAYS = new Set<string>([
  "2025-01-01",
  "2025-01-20",
  "2025-02-17",
  "2025-04-18",
  "2025-05-26",
  "2025-06-19",
  "2025-07-04",
  "2025-09-01",
  "2025-11-27",
  "2025-12-25",
  "2026-01-01",
  "2026-01-19",
  "2026-02-16",
  "2026-04-03",
  "2026-05-25",
  "2026-06-19",
  "2026-07-03",
  "2026-09-07",
  "2026-11-26",
  "2026-12-25",
  "2027-01-01",
  "2027-01-18",
  "2027-02-15",
  "2027-03-26",
  "2027-05-31",
  "2027-06-18",
  "2027-07-05",
  "2027-09-06",
  "2027-11-25",
  "2027-12-24",
]);

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function isoDateUtcParts(y: number, m: number, day: number): string {
  return `${y}-${pad(m)}-${pad(day)}`;
}

/** Calendar date in America/New_York as a UTC-midnight Date + ISO string. */
export function todayEt(now = new Date()): { date: Date; iso: string } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(now);
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const m = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);
  return { date: new Date(Date.UTC(y, m - 1, day)), iso: isoDateUtcParts(y, m, day) };
}

export function isWeekend(day: Date): boolean {
  // UTC-midnight Date representing an ET calendar day
  const wd = day.getUTCDay();
  return wd === 0 || wd === 6;
}

export function isNyseHoliday(day: Date): boolean {
  const iso = isoDateUtcParts(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate());
  return NYSE_HOLIDAYS.has(iso);
}

export function isTradingDay(day: Date): boolean {
  return !isWeekend(day) && !isNyseHoliday(day);
}

export function nextTradingDay(onOrAfter: Date): Date {
  const d = new Date(onOrAfter);
  for (let i = 0; i < 14; i++) {
    if (isTradingDay(d)) return d;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return onOrAfter;
}

/** Friday on/after date, rolled forward if that Friday is a holiday. */
export function nextWeeklyExpiration(onOrAfter: Date): Date {
  const d = new Date(onOrAfter);
  d.setUTCHours(0, 0, 0, 0);
  const delta = (5 - d.getUTCDay() + 7) % 7;
  d.setUTCDate(d.getUTCDate() + delta);
  return nextTradingDay(d);
}

/** 16:00 America/New_York on the expiration calendar day (handles EST/EDT). */
export function sessionCloseMs(expiration: Date): number {
  const y = expiration.getUTCFullYear();
  const month = expiration.getUTCMonth();
  const day = expiration.getUTCDate();
  for (const utcHour of [20, 21]) {
    const ms = Date.UTC(y, month, day, utcHour, 0, 0);
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/New_York",
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      hour12: false,
    }).formatToParts(new Date(ms));
    const hour = Number(parts.find((p) => p.type === "hour")?.value);
    const etDay = Number(parts.find((p) => p.type === "day")?.value);
    if (hour === 16 && etDay === day) return ms;
  }
  return Date.UTC(y, month, day, 20, 0, 0);
}

export type SessionPhase = "pre_market" | "regular" | "after_hours" | "closed";

export function sessionPhase(now = new Date()): SessionPhase {
  const { date, iso } = todayEt(now);
  if (!isTradingDay(date) || NYSE_HOLIDAYS.has(iso)) return "closed";

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  const minute = Number(parts.find((p) => p.type === "minute")?.value);
  const mins = hour * 60 + minute;
  if (mins < 9 * 60 + 30) return "pre_market";
  if (mins < 16 * 60) return "regular";
  return "after_hours";
}
