# Prop firm account provisioning

Automated provisioning models for sold prop firm evaluation accounts.

> **Stack note:** PropPredict runs as a single Next.js app. Database models are defined in **Prisma** (`prisma/schema.prisma`) with **Zod** validation schemas (`lib/schemas/provisioning.ts`) — the TypeScript equivalents of SQLAlchemy + Pydantic.

## Models

| Model | Purpose |
| --- | --- |
| `PropFirmAccount` | Sold account record (trader email, model tier, size, lifecycle status) |
| `ChallengeConfig` | 1:1 challenge rules per sold account |
| `TraderDemoAccount` | Provisioned demo login + virtual balance (credentials encrypted at rest) |

`PropFirmAccount.propFirmId` references `Tenant` (the white-label prop firm).

## Example usage

```typescript
import {
  activatePropFirmAccount,
  createPropFirmAccount,
  provisionTraderDemoAccount,
} from "@/lib/provisioning/accounts";

// 1. Record a sale
const sold = await createPropFirmAccount({
  propFirmId: tenant.id,
  traderEmail: "trader@example.com",
  modelType: "2step",
  accountSize: "100K",
  challengeConfig: {
    profitTarget: 10,
    dailyDrawdown: 5,
    maxDrawdown: 10,
    maxBetSizeValue: 2.5,
    maxBetSizeMode: "percent",
    otherCustomRules: { minTradingDays: 5 },
  },
});

// 2. Provision demo credentials
await provisionTraderDemoAccount({
  propFirmAccountId: sold.id,
  virtualBalance: 100_000,
  loginCredentials: {
    username: "trader@example.com",
    password: "generated-secure-password",
    loginUrl: "https://app.proppredict.com",
  },
});

// 3. Mark activated after credentials email sent
await activatePropFirmAccount(sold.id);
```

## Apply schema

```bash
npx prisma db push
npx prisma generate
```

## Environment

Set `CREDENTIALS_ENCRYPTION_KEY` (or reuse `SECRET_KEY`) for AES-256-GCM encryption of `TraderDemoAccount.login_credentials`.
