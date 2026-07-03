import { describe, expect, it, beforeEach } from "vitest";
import {
  buildWebhookRateLimitKey,
  checkRateLimit,
  resetRateLimitStore,
} from "@/lib/provisioning/rate-limit";

describe("webhook rate limiter", () => {
  beforeEach(() => {
    resetRateLimitStore();
  });

  it("allows requests under the limit", () => {
    const key = buildWebhookRateLimitKey({
      propFirmId: "firm-1",
      ipAddress: "1.2.3.4",
      apiKeyPrefix: "ppk_test",
    });

    const first = checkRateLimit(key, { maxRequests: 2, windowMs: 60_000 });
    const second = checkRateLimit(key, { maxRequests: 2, windowMs: 60_000 });

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(second.remaining).toBe(0);
  });

  it("blocks requests over the limit", () => {
    const key = "test-key";
    const config = { maxRequests: 1, windowMs: 60_000 };

    expect(checkRateLimit(key, config).allowed).toBe(true);
    const blocked = checkRateLimit(key, config);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });
});
