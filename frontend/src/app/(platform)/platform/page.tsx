import Link from "next/link";
import {
  getPlatformActivity,
  getPlatformAnalytics,
  getPlatformStats,
  listFirmOverviews,
} from "@/lib/services";
import { formatCompactUsd, formatPct } from "@/lib/format";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatCards, type Stat } from "@/components/dashboard/stat-cards";
import { ActivityFeed } from "@/components/platform/activity-feed";
import { FirmsTable } from "@/components/platform/firms-table";
import { PlatformAnalytics } from "@/components/platform/platform-analytics";

export default async function PlatformOverviewPage() {
  const stats = getPlatformStats();
  const firms = listFirmOverviews();
  const analytics = getPlatformAnalytics();
  const activity = getPlatformActivity();

  const kpis: Stat[] = [
    {
      label: "Prop firms",
      value: `${stats.totalFirms}`,
      sub: `${stats.activeFirms} active`,
      trend: "flat",
    },
    {
      label: "Traders",
      value: `${stats.totalTraders}`,
      sub: `${stats.activeTraders} active · ${formatPct(stats.avgPassRate)} pass rate`,
      trend: stats.avgPassRate >= 50 ? "up" : "down",
    },
    {
      label: "24h volume",
      value: formatCompactUsd(stats.volume24h),
      sub: `${formatCompactUsd(stats.totalVolume)} all-time`,
      trend: "up",
    },
    {
      label: "Revenue",
      value: formatCompactUsd(stats.revenue),
      sub: `${formatCompactUsd(stats.revenue24h)} last 24h`,
      trend: "up",
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <StatCards stats={kpis} />
      <PlatformAnalytics data={analytics} />
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="All prop firms"
            subtitle="Ranked by total volume"
            action={
              <Link
                href="/platform/firms"
                className="text-xs font-medium text-accent transition-opacity hover:opacity-80"
              >
                View all
              </Link>
            }
          />
          <CardBody>
            <FirmsTable firms={firms} />
          </CardBody>
        </Card>
        <Card className="self-start">
          <CardHeader title="Recent activity" subtitle="Cross-tenant events" />
          <CardBody>
            <ActivityFeed items={activity} limit={8} />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
