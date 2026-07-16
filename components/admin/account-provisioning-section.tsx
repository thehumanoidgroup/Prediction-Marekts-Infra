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
          subtitle="Issue evaluation accounts for Kalshi, S&P 500 Dynamic, Polymarket, or internal markets"
          action={
            <IssueKalshiAccountButton onIssued={() => setRefreshKey((k) => k + 1)} />
          }
        />
        <CardBody>
          <p className="text-sm text-muted">
            Traders receive virtual balances tied to the selected market provider. Choose{" "}
            <span className="font-medium text-foreground">S&amp;P 500 Dynamic Markets</span> to
            open 0DTE / weekly stock-event boards automatically. All P&amp;L is simulated;
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
