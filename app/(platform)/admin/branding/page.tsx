import { getRequestTenant } from "@/lib/tenant-server";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { BrandingForm } from "@/components/admin/branding-form";

export default async function AdminBrandingPage() {
  const tenant = await getRequestTenant();

  return (
    <Card>
      <CardHeader
        title="Branding customization"
        subtitle={`White-label theme served on ${tenant.slug}.proppredict.com`}
      />
      <CardBody>
        <BrandingForm tenant={tenant} />
      </CardBody>
    </Card>
  );
}
