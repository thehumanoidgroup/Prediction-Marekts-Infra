import { listGlobalMarketTemplates } from "@/lib/services";
import { formatDate, formatTimeUntil } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { GlobalMarketForm } from "@/components/platform/global-market-form";

export default async function PlatformMarketsPage() {
  const templates = listGlobalMarketTemplates();

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Card className="self-start xl:col-span-2">
        <CardHeader
          title="Publish global template"
          subtitle="Templates are available for all prop firms to deploy"
        />
        <CardBody>
          <GlobalMarketForm />
        </CardBody>
      </Card>

      <Card className="self-start">
        <CardHeader
          title="Global templates"
          subtitle={`${templates.length} published`}
        />
        <CardBody>
          <ul className="divide-y divide-edge/60">
            {templates.map((template) => (
              <li key={template.id} className="py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="line-clamp-2 text-[13px] font-medium text-foreground">
                    {template.question}
                  </p>
                  <Badge tone="accent">Global</Badge>
                </div>
                <p className="mt-1 text-[11px] text-faint capitalize">
                  {template.category} · {Math.round(template.yesPrice * 100)}% · closes{" "}
                  {formatDate(template.closesAt)} ({formatTimeUntil(template.closesAt)})
                </p>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
