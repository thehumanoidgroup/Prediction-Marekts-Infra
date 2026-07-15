import { LiveFeedMonitor } from "@/components/platform/live-feed-monitor";

export default function PlatformLiveFeedPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Live feed monitor</h2>
        <p className="mt-1 text-sm text-muted">
          Real-time WebSocket connections, event engagement, and active market snapshots.
        </p>
      </div>
      <LiveFeedMonitor />
    </div>
  );
}
