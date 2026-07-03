import { prisma } from "@/lib/db";
import { getOrCreateFirmSettings } from "@/lib/provisioning/firm-settings";
import { getRequestSlug } from "@/lib/tenant-server";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ProvisioningSettingsForm } from "@/components/admin/provisioning-settings-form";
import { formatPct } from "@/lib/format";
import type { PropFirmModelType } from "@/types/provisioning";

const MODEL_LABELS: Record<PropFirmModelType, string> = {
  "1step": "1-Step",
  "2step": "2-Step",
  "3step": "3-Step",
  instant: "Instant",
};

export default async function AdminProvisioningPage() {
  const slug = await getRequestSlug();
  let settings = null;

  if (process.env.DATABASE_URL) {
    const tenant = await prisma.tenant.findFirst({
      where: { slug, isActive: true },
      select: { id: true },
    });
    if (tenant) {
      settings = await getOrCreateFirmSettings(tenant.id);
    }
  }

  if (!settings) {
    return (
      <Card>
        <CardHeader title="Provisioning defaults" subtitle="Database required" />
        <CardBody>
          <p className="text-sm text-muted">
            Connect a database to configure per-model provisioning defaults.
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Card className="xl:col-span-2">
        <CardHeader
          title="Provisioning defaults"
          subtitle="Default challenge rules per model, allowed sizes, and purchaser overrides"
        />
        <CardBody>
          <ProvisioningSettingsForm settings={settings} />
        </CardBody>
      </Card>

      <Card className="self-start">
        <CardHeader title="Resolution order" subtitle="How rules are applied at sale time" />
        <CardBody>
          <ol className="list-decimal space-y-2 pl-4 text-sm text-muted">
            <li>Platform preset for the model type</li>
            <li>Firm program defaults (Challenge rules tab)</li>
            <li>Per-model defaults configured here</li>
            <li>Purchase `custom_rules` (allowed fields only)</li>
            <li>Super Admin manual overrides (if any)</li>
          </ol>
          <div className="mt-4 border-t border-edge/60 pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-faint">
              Enabled models
            </p>
            <p className="mt-1 text-sm font-medium">
              {settings.allowedModelTypes.map((m) => MODEL_LABELS[m]).join(" · ")}
            </p>
            <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-faint">
              Account sizes
            </p>
            <p className="mt-1 text-sm font-medium">
              {settings.allowedAccountSizes.join(" · ")}
            </p>
            <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-faint">
              Example 2-step target
            </p>
            <p className="mt-1 text-sm font-medium">
              {settings.modelDefaults["2step"]?.profitTarget != null
                ? formatPct(settings.modelDefaults["2step"].profitTarget!, 0)
                : "Platform default"}
            </p>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
