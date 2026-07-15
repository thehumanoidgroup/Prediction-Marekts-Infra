import { NextResponse } from "next/server";
import { getRequestTenant } from "@/lib/tenant-server";
import { ensureSeeded } from "@/lib/seed";
import { listPropFirmAccountsByFirm } from "@/lib/provisioning/accounts";
import { provisioningDbUnavailable } from "@/lib/provisioning/route-auth";
import { toFirmSoldAccount } from "@/lib/provisioning/kalshi-admin";
import { prisma } from "@/lib/db";

export async function GET() {
  if (!process.env.DATABASE_URL) return provisioningDbUnavailable();

  const tenant = await getRequestTenant();
  await ensureSeeded();

  const accounts = await listPropFirmAccountsByFirm(tenant.id);
  const users = await prisma.user.findMany({
    where: { tenantId: tenant.id, email: { in: accounts.map((a) => a.traderEmail) } },
    select: { email: true, displayName: true },
  });
  const names = new Map(users.map((user) => [user.email.toLowerCase(), user.displayName]));

  return NextResponse.json(
    accounts.map((account) => toFirmSoldAccount(account, names.get(account.traderEmail.toLowerCase()))),
  );
}
