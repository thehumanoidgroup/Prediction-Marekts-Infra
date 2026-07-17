import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { ensureSeeded } from "@/lib/seed";
import { getFirmDetail } from "@/lib/services";
import { getAllTemplatesForPropFirm } from "@/lib/provisioning/challenge-template-service";
import { formatCompactUsd, formatDate, formatPct, formatSignedUsd, formatUsd } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatCards, type Stat } from "@/components/dashboard/stat-cards";
import { TradersTable } from "@/components/admin/traders-table";
import { FirmChallengeTemplatesReadonly } from "@/components/platform/firm-challenge-templates-readonly";
import { IconChevronLeft } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import type { ChallengeTemplateView } from "@/lib/provisioning/challenge-template-defaults";

async function loadFirmChallengeTemplates(
  firmId: string,
  firmSlug: string,
): Promise<ChallengeTemplateView[] | null> {
  if (!process.env.DATABASE_URL) return null;

  await ensureSeeded();
  const tenant = await prisma.tenant.findFirst({
    where: {
      isActive: true,
      OR: [{ id: firmId }, { slug: firmSlug }],
    },
    select: { id: true },
  });
  if (!tenant) return null;
  return getAllTemplatesForPropFirm(tenant.id);
}

export default async function PlatformFirmDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const firm = getFirmDetail(id);
  if (!firm) notFound();

  const challengeTemplates = await loadFirmChallengeTemplates(firm.id, firm.slug);

  const kpis: Stat[] = [
    {
      label: "Traders",
      value: `${firm.traders}`,
      sub: `${firm.activeTraders} active · ${firm.fundedTraders} funded`,
      trend: "flat",
    },
    {
      label: "Pass rate",
      value: formatPct(firm.passRate),
      sub: `${firm.failedTraders} failed`,
      trend: firm.passRate >= 50 ? "up" : "down",
    },
    {
      label: "Total volume",
      value: formatCompactUsd(firm.totalVolume),
      sub: `${formatCompactUsd(firm.volume24h)} last 24h`,
      trend: "up",
    },
    {
      label: "Revenue",
      value: formatCompactUsd(firm.revenue),
      sub: `${formatCompactUsd(firm.totalEquity)} trader equity`,
      trend: "up",
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/platform/firms"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted transition-colors hover:text-foreground"
      >
        <IconChevronLeft className="text-base" />
        All firms
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span
            className="flex size-12 items-center justify-center rounded-xl text-lg font-bold"
            style={{
              backgroundColor: `${firm.accent}22`,
              color: firm.accent,
            }}
          >
            {firm.logoGlyph}
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold tracking-tight">{firm.name}</h2>
              <Badge tone={firm.isActive ? "up" : "neutral"}>
                {firm.isActive ? "Active" : "Inactive"}
              </Badge>
            </div>
            <p className="text-sm text-muted">
              {firm.slug}.proppredict.com · {firm.tagline}
            </p>
            <p className="mt-0.5 text-[11px] text-faint">
              Onboarded {formatDate(firm.onboardedAt)}
            </p>
          </div>
        </div>
        <div className="tabular rounded-lg border border-edge bg-surface-2 px-4 py-2 text-right text-sm">
          <p className="text-[11px] text-muted">At-risk traders</p>
          <p className={cn("text-lg font-semibold", firm.atRiskTraders > 0 ? "text-warn" : "text-up")}>
            {firm.atRiskTraders}
          </p>
        </div>
      </div>

      <StatCards stats={kpis} />

      {challengeTemplates ? (
        <FirmChallengeTemplatesReadonly
          templates={challengeTemplates}
          firmName={firm.name}
        />
      ) : (
        <Card>
          <CardHeader
            title="Challenge Rules by Model Type"
            subtitle="Database required for template audit view"
            action={<Badge tone="neutral">Read-only</Badge>}
          />
          <CardBody>
            <p className="text-sm text-muted">
              Connect a database to inspect this firm&apos;s challenge templates.
            </p>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Trader roster"
          subtitle={`${firm.roster.length} accounts · ${formatPct(firm.avgWinRate)} avg win rate`}
        />
        <CardBody>
          <TradersTable traders={firm.roster} />
        </CardBody>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardBody className="pt-4">
            <p className="text-xs font-medium text-muted">Aggregate P&L</p>
            <p className="tabular mt-1.5 text-xl font-semibold">
              {formatSignedUsd(firm.roster.reduce((sum, t) => sum + t.pnl, 0))}
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="pt-4">
            <p className="text-xs font-medium text-muted">Total equity</p>
            <p className="tabular mt-1.5 text-xl font-semibold">{formatUsd(firm.totalEquity)}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="pt-4">
            <p className="text-xs font-medium text-muted">Platform revenue</p>
            <p className="tabular mt-1.5 text-xl font-semibold">{formatCompactUsd(firm.revenue)}</p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
