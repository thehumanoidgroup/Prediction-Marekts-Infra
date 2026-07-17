/**
 * Smoke-test: manual issuance email templates + console delivery.
 * Run: npx tsx scripts/verify-issuance-email.ts
 * (or via vitest — see __tests__/email/issuance-flow.test.ts)
 */

import { deliverEmail } from "../lib/email/send";
import { getEmailConfig } from "../lib/email/config";
import {
  renderPropFirmNotificationEmail,
  renderTraderCredentialsEmail,
} from "../lib/email/templates";
import type { PropFirmAccountRecord } from "../types/provisioning";

const account: PropFirmAccountRecord = {
  id: "acc_verify_1",
  propFirmId: "firm_verify",
  traderEmail: "verify-trader@example.com",
  modelType: "1step",
  accountSize: "25K",
  status: "provisioned",
  purchasedAt: new Date().toISOString(),
  credentialsSentAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  challengeConfig: null,
  traderDemoAccount: null,
};

async function main() {
  const config = getEmailConfig();
  console.log("Email config:", {
    enabled: config.enabled,
    provider: config.provider,
    from: config.from,
  });

  const trader = renderTraderCredentialsEmail({
    account,
    credentials: {
      username: "verify-trader@example.com",
      password: "TempVerify123!",
      loginUrl: "http://localhost:3000/login?tenant=apex",
    },
    context: {
      firmName: "Apex Prop",
      supportContact: config.supportContact,
      appUrl: config.appUrl,
      dashboardUrl: `${config.appUrl}/dashboard?tenant=apex`,
      virtualBalance: 25_000,
      challengeConfig: {
        profitTarget: 10,
        dailyDrawdown: 5,
        maxDrawdown: 10,
        maxBetSizeValue: 2,
        maxBetSizeMode: "percent",
      },
      provider: "kalshi",
      tenantSlug: "apex",
    },
  });

  if (!trader.subject.includes("Prediction Markets Account is Ready")) {
    throw new Error(`Unexpected trader subject: ${trader.subject}`);
  }
  if (!trader.text.includes("Challenge rules") || !trader.text.includes("Support contact")) {
    throw new Error("Trader email missing required body sections");
  }

  const delivered = await deliverEmail({
    to: account.traderEmail,
    subject: trader.subject,
    html: trader.html,
    text: trader.text,
  });
  console.log("Trader email delivery:", delivered);

  const firm = renderPropFirmNotificationEmail({
    account,
    credentials: {
      username: "verify-trader@example.com",
      password: "TempVerify123!",
    },
    context: {
      firmName: "Apex Prop",
      supportContact: config.supportContact,
      appUrl: config.appUrl,
      dashboardUrl: `${config.appUrl}/dashboard?tenant=apex`,
      virtualBalance: 25_000,
      challengeConfig: {
        profitTarget: 10,
        dailyDrawdown: 5,
        maxDrawdown: 10,
        maxBetSizeValue: 2,
        maxBetSizeMode: "percent",
      },
      provider: "kalshi",
      tenantSlug: "apex",
      issuedByName: "Verify Admin",
    },
    recipientEmail: "admin@apex.example",
  });

  const firmDelivered = await deliverEmail({
    to: "admin@apex.example",
    subject: firm.subject,
    html: firm.html,
    text: firm.text,
  });
  console.log("Firm copy delivery:", firmDelivered);
  console.log("✓ Issuance email verification passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
