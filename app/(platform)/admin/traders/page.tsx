import { getRequestTenant } from "@/lib/tenant-server";
import { getFirmStats, getFirmTraders } from "@/lib/services";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { TradersTable } from "@/components/admin/traders-table";
import Link from "next/link";

export default async function AdminTradersPage() {
  const tenant = await getRequestTenant();
  const traders = getFirmTraders(tenant.id);
  const stats = getFirmStats(tenant.id);

  return (
    <Card>
      <CardHeader
        title="Trader management"
        subtitle={`${traders.length} traders · ${stats.activeTraders} active · ${stats.fundedTraders} funded · ${stats.failedTraders} failed`}
        action={
          <Link
            href="/admin/accounts"
            className="text-xs font-medium text-accent transition-opacity hover:opacity-80"
          >
            Issue Kalshi account
          </Link>
        }
      />
      <CardBody>
        <TradersTable traders={traders} />
      </CardBody>
    </Card>
  );
}
