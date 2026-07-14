import { getRequestTenant } from "@/lib/tenant-server";
import { getFirmStats, getFirmTraders } from "@/lib/services";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ProvisionAccountForm } from "@/components/admin/provision-account-form";
import { TradersTable } from "@/components/admin/traders-table";

export default async function AdminTradersPage() {
  const tenant = await getRequestTenant();
  const traders = getFirmTraders(tenant.id);
  const stats = getFirmStats(tenant.id);

  return (
    <Card>
      <CardHeader
        title="Trader management"
        subtitle={`${traders.length} traders · ${stats.activeTraders} active · ${stats.fundedTraders} funded · ${stats.failedTraders} failed`}
      />
      <CardBody>
        <div className="mb-6">
          <ProvisionAccountForm />
        </div>
        <TradersTable traders={traders} />
      </CardBody>
    </Card>
  );
}
