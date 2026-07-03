import { prisma } from "@/lib/db";
import { ensureSeeded } from "@/lib/seed";
import { serializePropFirmAccount } from "@/lib/provisioning/serialize";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ProvisioningManualForm } from "@/components/platform/provisioning-manual-form";
import { Badge } from "@/components/ui/badge";

export default async function PlatformProvisioningPage() {
  if (!process.env.DATABASE_URL) {
    return (
      <Card>
        <CardHeader title="Account provisioning" subtitle="Database required" />
        <CardBody>
          <p className="text-sm text-muted">Connect PostgreSQL to manage provisioned accounts.</p>
        </CardBody>
      </Card>
    );
  }

  await ensureSeeded();

  const [firms, accounts, auditLogs] = await Promise.all([
    prisma.tenant.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.propFirmAccount.findMany({
      take: 15,
      orderBy: { createdAt: "desc" },
      include: { challengeConfig: true, traderDemoAccount: true },
    }),
    prisma.provisioningAuditLog.findMany({
      take: 10,
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const serializedAccounts = accounts.map(serializePropFirmAccount);

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Card className="xl:col-span-2">
        <CardHeader
          title="Manual provisioning"
          subtitle="Create sold accounts on behalf of a prop firm"
        />
        <CardBody>
          <ProvisioningManualForm firms={firms} />
        </CardBody>
      </Card>

      <Card className="self-start">
        <CardHeader title="Recent audit log" subtitle="Every provisioning attempt" />
        <CardBody>
          <ul className="divide-y divide-edge/60 text-sm">
            {auditLogs.length === 0 ? (
              <li className="py-2 text-muted">No provisioning events yet.</li>
            ) : (
              auditLogs.map((log) => (
                <li key={log.id} className="py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={log.status === "success" ? "up" : log.status === "failed" ? "down" : "accent"}>
                      {log.status}
                    </Badge>
                    <span className="text-xs text-faint">
                      {log.createdAt.toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-1 text-muted">
                    {log.accountSize} {log.modelType} · {log.traderEmail}
                  </p>
                  {log.errorMessage ? (
                    <p className="mt-0.5 text-xs text-down">{log.errorMessage}</p>
                  ) : null}
                </li>
              ))
            )}
          </ul>
        </CardBody>
      </Card>

      <Card className="xl:col-span-3">
        <CardHeader title="Recent accounts" subtitle="Latest provisioned evaluations" />
        <CardBody>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-edge text-xs text-muted">
                  <th className="pb-2 pr-4 font-medium">Trader</th>
                  <th className="pb-2 pr-4 font-medium">Model</th>
                  <th className="pb-2 pr-4 font-medium">Size</th>
                  <th className="pb-2 pr-4 font-medium">Status</th>
                  <th className="pb-2 font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-edge/60">
                {serializedAccounts.map((account) => (
                  <tr key={account.id}>
                    <td className="py-2.5 pr-4 font-medium">{account.traderEmail}</td>
                    <td className="py-2.5 pr-4 text-muted">{account.modelType}</td>
                    <td className="py-2.5 pr-4 text-muted">{account.accountSize}</td>
                    <td className="py-2.5 pr-4">
                      <Badge tone={account.status === "provisioned" ? "up" : "accent"}>
                        {account.status}
                      </Badge>
                    </td>
                    <td className="py-2.5 text-muted">
                      {new Date(account.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
