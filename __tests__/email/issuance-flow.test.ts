import { describe, expect, it } from "vitest";
import { getEmailConfig } from "@/lib/email/config";
import { deliverEmail } from "@/lib/email/send";
import {
  renderPropFirmNotificationEmail,
  renderTraderCredentialsEmail,
} from "@/lib/email/templates";
import type { PropFirmAccountRecord } from "@/types/provisioning";

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

describe("manual issuance email flow", () => {
  it("renders trader ready email and delivers via console/resend config", async () => {
    const config = getEmailConfig();
    expect(config.enabled).toBe(true);

    const rendered = renderTraderCredentialsEmail({
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

    expect(rendered.subject).toBe(
      "Your Apex Prop Prediction Markets Account is Ready",
    );
    expect(rendered.text).toContain("Login credentials");
    expect(rendered.text).toContain("Challenge rules");
    expect(rendered.text).toContain("Support contact:");

    const result = await deliverEmail({
      to: account.traderEmail,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
    expect(result.id).toBeTruthy();
    expect(["console", "resend"]).toContain(result.provider);
  });

  it("renders optional firm admin confirmation copy", async () => {
    const config = getEmailConfig();
    const rendered = renderPropFirmNotificationEmail({
      account,
      credentials: {
        username: "verify-trader@example.com",
        password: "secret",
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

    expect(rendered.subject).toContain("Account issued");
    expect(rendered.text).toContain("Issued by: Verify Admin");

    const result = await deliverEmail({
      to: "admin@apex.example",
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
    expect(result.id).toBeTruthy();
  });
});
