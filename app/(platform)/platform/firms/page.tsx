import { listFirmOverviews } from "@/lib/services";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { FirmsTable } from "@/components/platform/firms-table";

export default async function PlatformFirmsPage() {
  const firms = listFirmOverviews();

  return (
    <Card>
      <CardHeader
        title="All prop firms"
        subtitle={`${firms.length} tenants on the platform`}
      />
      <CardBody>
        <FirmsTable firms={firms} />
      </CardBody>
    </Card>
  );
}
