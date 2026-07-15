"use client";

import { useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { IssueKalshiAccountButton } from "@/components/admin/kalshi-issuance-panel";
import { FirmSoldAccountsTable } from "@/components/admin/firm-sold-accounts-table";

/** Account provisioning and sold-accounts section for Prop Firm Admins. */
export function AccountProvisioningSection() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader
          title="Account provisioning"
          subtitle="Issue Kalshi-linked evaluation accounts with custom challenge rules"
          action={
            <IssueKalshiAccountButton onIssued={() => setRefreshKey((k) => k + 1)} />
          }
        />
        <CardBody>
          <p className="text-sm text-muted">
            Traders receive virtual balances tied to live Kalshi markets. All P&amp;L is simulated;
            challenge rules are enforced by the platform risk engine.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Sold accounts" subtitle="Accounts issued by your firm" />
        <CardBody>
          <FirmSoldAccountsTable refreshKey={refreshKey} />
        </CardBody>
      </Card>
    </div>
  );
}
