import { getRequestTenant } from "@/lib/tenant-server";
import { formatCompactUsd, formatPct, formatUsd } from "@/lib/format";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ChallengeForm } from "@/components/admin/challenge-form";

export default async function AdminChallengesPage() {
  const tenant = await getRequestTenant();
  const program = tenant.program;

  const preview = [
    { label: "Profit target", value: formatPct(program.profitTargetPct, 0) },
    { label: "Max daily loss", value: formatPct(program.maxDailyLossPct, 0) },
    {
      label: "Max drawdown",
      value: `${formatPct(program.maxDrawdownPct, 0)} · ${program.drawdownMode}`,
    },
    { label: "Max stake / pick", value: formatUsd(program.maxStakePerOrder) },
    { label: "Max exposure / market", value: formatUsd(program.maxExposurePerMarket) },
    { label: "Time limit", value: `${program.challengeDurationDays} days` },
    { label: "Min trading days", value: `${program.minTradingDays}` },
    { label: "Profit split", value: formatPct(program.profitSplitPct, 0) },
  ];

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Card className="xl:col-span-2">
        <CardHeader
          title="Challenge rule configuration"
          subtitle="Rules apply to new evaluations and drive the risk engine in real time"
        />
        <CardBody>
          <ChallengeForm program={program} />
        </CardBody>
      </Card>

      <Card className="self-start">
        <CardHeader title="Trader-facing preview" subtitle="What applicants see on your site" />
        <CardBody>
          <dl className="divide-y divide-edge/60">
            {preview.map((row) => (
              <div key={row.label} className="flex items-center justify-between py-2.5 text-sm">
                <dt className="text-muted">{row.label}</dt>
                <dd className="tabular font-semibold capitalize">{row.value}</dd>
              </div>
            ))}
            <div className="flex items-center justify-between py-2.5 text-sm">
              <dt className="text-muted">Account sizes</dt>
              <dd className="tabular font-semibold">
                {program.accountSizes.map((s) => formatCompactUsd(s)).join(" · ")}
              </dd>
            </div>
          </dl>
        </CardBody>
      </Card>
    </div>
  );
}
