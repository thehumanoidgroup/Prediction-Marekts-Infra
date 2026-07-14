import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { SoldAccountsTable } from "@/components/platform/sold-accounts-table";

export default function PlatformSoldAccountsPage() {
  return (
    <Card>
      <CardHeader
        title="Sold accounts"
        subtitle="Audit log of evaluation accounts issued via webhook, admin dashboard, or signup"
      />
      <CardBody>
        <SoldAccountsTable />
      </CardBody>
    </Card>
  );
}
