import { describe, expect, it } from "vitest";
import { EventBroadcaster, resetEventBroadcaster } from "@/lib/realtime/event-broadcaster";
import { resetRedisPubSub } from "@/lib/realtime/redis";

describe("EventBroadcaster", () => {
  it("publishes price updates via in-memory bus", async () => {
    resetRedisPubSub();
    resetEventBroadcaster();
    const broadcaster = new EventBroadcaster();
    await broadcaster.init();
    expect(broadcaster.backend).toBe("memory");

    const received: number[] = [];
    const pubSub = await broadcaster.init();
    const unsubscribe = await pubSub.subscribe(
      [{ scope: "market", marketId: "mkt-9" }],
      (event) => {
        if (event.type === "price_update") received.push(event.yesPrice);
      },
    );

    await broadcaster.broadcastPriceUpdate({
      marketId: "mkt-9",
      marketCategory: "crypto",
      yesPrice: 0.44,
    });

    expect(received).toHaveLength(1);
    expect(received[0]).toBe(0.44);
    await unsubscribe();
    await broadcaster.close();
  });
});
