import { getBackendUrl } from "@/lib/backend";
import type {
  ChallengeAccount,
  JournalEntry,
  Market,
  Order,
  Outcome,
  PolymarketIntegrationStatus,
  KalshiIntegrationStatus,
  PortfolioSummary,
  Position,
} from "@/lib/types";
import type { EnrichedPosition } from "@/lib/services";

export interface PortfolioPayload {
  account: ChallengeAccount;
  positions: EnrichedPosition[];
  summary: PortfolioSummary;
}

export interface MarketsPayload {
  markets: Market[];
  source?: import("@/lib/types").MarketViewSource;
  counts?: { internal: number; polymarket: number };
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface PolymarketMarketsPayload extends MarketsPayload {
  pagination?: PaginationMeta;
  query?: string;
}

export interface JournalPayload {
  journal: JournalEntry[];
}

export interface OrderResult {
  order: Order;
  position: Position | null;
}

interface BackendOptions {
  tenantSlug: string;
  method?: string;
  body?: unknown;
  search?: Record<string, string>;
}

async function backendFetch<T>(path: string, options: BackendOptions): Promise<T | null> {
  const base = getBackendUrl();
  if (!base) return null;

  const url = new URL(`${base}/api/v1/trading${path}`);
  if (options.search) {
    for (const [key, value] of Object.entries(options.search)) {
      url.searchParams.set(key, value);
    }
  }

  try {
    const response = await fetch(url.toString(), {
      method: options.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Tenant-Slug": options.tenantSlug,
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      cache: "no-store",
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(
        typeof err.detail === "string"
          ? err.detail
          : typeof err.error === "string"
            ? err.error
            : `Backend error ${response.status}`,
      );
    }

    return (await response.json()) as T;
  } catch (error) {
    console.error(`[backend] ${path}:`, error);
    return null;
  }
}

export async function fetchBackendPortfolio(tenantSlug: string): Promise<PortfolioPayload | null> {
  return backendFetch<PortfolioPayload>("/portfolio", { tenantSlug });
}

export async function fetchBackendMarkets(
  tenantSlug: string,
  filters: {
    category?: string;
    query?: string;
    sort?: string;
    source?: import("@/lib/types").MarketViewSource;
  } = {},
): Promise<MarketsPayload | null> {
  return backendFetch<MarketsPayload>("/markets", {
    tenantSlug,
    search: {
      category: filters.category ?? "all",
      q: filters.query ?? "",
      sort: filters.sort ?? "volume",
      source: filters.source ?? "all",
    },
  });
}

export async function fetchBackendJournal(tenantSlug: string): Promise<JournalPayload | null> {
  return backendFetch<JournalPayload>("/journal", { tenantSlug });
}

async function backendFetchRoot<T>(
  path: string,
  options: { search?: Record<string, string> } = {},
): Promise<T | null> {
  const base = getBackendUrl();
  if (!base) return null;

  const url = new URL(`${base}/api/v1${path}`);
  if (options.search) {
    for (const [key, value] of Object.entries(options.search)) {
      url.searchParams.set(key, value);
    }
  }

  try {
    const response = await fetch(url.toString(), {
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(
        typeof err.detail === "string"
          ? err.detail
          : `Backend error ${response.status}`,
      );
    }

    return (await response.json()) as T;
  } catch (error) {
    console.error(`[backend] ${path}:`, error);
    return null;
  }
}

export async function fetchBackendPolymarketMarkets(
  filters: {
    query?: string;
    active?: boolean;
    refresh?: boolean;
    category?: string;
    sort?: string;
    page?: number;
    pageSize?: number;
  } = {},
): Promise<PolymarketMarketsPayload | null> {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.active) params.set("active", "true");
  if (filters.refresh) params.set("refresh", "true");
  if (filters.category && filters.category !== "all") params.set("category", filters.category);
  if (filters.sort) params.set("sort", filters.sort);
  if (filters.page) params.set("page", String(filters.page));
  if (filters.pageSize) params.set("pageSize", String(filters.pageSize));

  const path = filters.query
    ? `/polymarket/search?${params.toString()}`
    : `/polymarket/markets?${params.toString()}`;

  return backendFetchRoot<PolymarketMarketsPayload>(path);
}

export async function fetchBackendPolymarketMarket(
  marketId: string,
): Promise<{ market: Market } | null> {
  return backendFetchRoot<{ market: Market }>(`/polymarket/markets/${encodeURIComponent(marketId)}`);
}

export async function fetchBackendPolymarketStatus(): Promise<PolymarketIntegrationStatus | null> {
  return backendFetchRoot<PolymarketIntegrationStatus>("/polymarket/status");
}

export async function fetchBackendKalshiStatus(): Promise<KalshiIntegrationStatus | null> {
  return backendFetchRoot<KalshiIntegrationStatus>("/kalshi/status");
}

export async function postBackendOrder(
  tenantSlug: string,
  input: { marketId: string; outcome: Outcome; side: "buy" | "sell"; shares: number },
): Promise<OrderResult | null> {
  return backendFetch<OrderResult>("/orders", {
    tenantSlug,
    method: "POST",
    body: input,
  });
}

export async function postBackendJournalNote(
  tenantSlug: string,
  note: string,
  tags: string[] = [],
): Promise<{ entry: JournalEntry } | null> {
  return backendFetch<{ entry: JournalEntry }>("/journal", {
    tenantSlug,
    method: "POST",
    body: { note, tags },
  });
}

export async function fetchBackendLiveEvents(
  tenantSlug: string,
  filters: {
    category?: string;
    source?: import("@/lib/types").MarketViewSource;
  } = {},
): Promise<import("@/lib/types").LiveEventsPayload | null> {
  const base = getBackendUrl();
  if (!base) return null;

  const url = new URL(`${base}/api/v1/live-events`);
  url.searchParams.set("category", filters.category ?? "all");
  url.searchParams.set("source", filters.source ?? "all");

  try {
    const response = await fetch(url.toString(), {
      headers: {
        "Content-Type": "application/json",
        "X-Tenant-Slug": tenantSlug,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(
        typeof err.detail === "string" ? err.detail : `Backend error ${response.status}`,
      );
    }

    const { mapLiveEventsPayload } = await import("@/lib/live-events");
    return mapLiveEventsPayload(await response.json());
  } catch (error) {
    console.error("[backend] /live-events:", error);
    return null;
  }
}
