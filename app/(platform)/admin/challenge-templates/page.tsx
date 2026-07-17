import { prisma } from "@/lib/db";
import { getAllTemplatesForPropFirm } from "@/lib/provisioning/challenge-template-service";
import { getRequestSlug } from "@/lib/tenant-server";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ChallengeModelTemplatesPanel } from "@/components/admin/challenge-model-templates-panel";

export default async function AdminChallengeModelTemplatesPage() {
  const slug = await getRequestSlug();
  let templates = null;

  if (process.env.DATABASE_URL) {
    const tenant = await prisma.tenant.findFirst({
      where: { slug, isActive: true },
      select: { id: true },
    });
    if (tenant) {
      templates = await getAllTemplatesForPropFirm(tenant.id);
    }
  }

  if (!templates) {
    return (
      <Card>
        <CardHeader
          title="Challenge Rules by Model Type"
          subtitle="Database required"
        />
        <CardBody>
          <p className="text-sm text-muted">
            Connect a database to configure per-model challenge templates used at
            account issuance.
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-base font-semibold text-foreground">
          Challenge Rules by Model Type
        </h1>
        <p className="mt-1 text-sm text-muted">
          Templates applied when issuing 1-step, 2-step, 3-step, and instant accounts.
          Per-account overrides from webhooks or manual issuance still win.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <ChallengeModelTemplatesPanel initialTemplates={templates} />
        </div>

        <Card className="self-start">
          <CardHeader title="How this works" subtitle="Issuance resolution order" />
          <CardBody>
            <ol className="list-decimal space-y-2.5 pl-4 text-sm text-muted">
              <li>Platform preset for the selected model type</li>
              <li>
                Firm template saved here for that model (profit target, drawdowns, bet
                size, consistency)
              </li>
              <li>
                Per-account overrides from the purchase webhook or manual issuance form
              </li>
            </ol>
            <div className="mt-5 space-y-3 border-t border-edge/60 pt-4 text-sm">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-faint">
                  Max bet modes
                </p>
                <p className="mt-1 text-muted">
                  <span className="font-medium text-foreground">% of balance</span> scales
                  with account size ·{" "}
                  <span className="font-medium text-foreground">Fixed USD</span> is an
                  absolute per-pick cap
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-faint">
                  Other rules
                </p>
                <p className="mt-1 text-muted">
                  Free-form JSON for drawdown mode, profit split, duration, exposure caps,
                  and future firm policies
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-faint">
                  Reset
                </p>
                <p className="mt-1 text-muted">
                  Removes the saved firm row so new accounts fall back to platform defaults
                </p>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
