# Prop firm account provisioning

Automated provisioning models and services for sold prop firm evaluation accounts.

> **Stack note:** PropPredict runs as a single Next.js app. The orchestration service lives at
> **`services/account-provisioning.ts`** (equivalent to the requested `backend/services/account_provisioning.py`).

## Models

| Model | Purpose |
| --- | --- |
| `PropFirmAccount` | Sold account record (trader email, model tier, size, lifecycle status) |
| `ChallengeConfig` | 1:1 challenge rules per sold account |
| `TraderDemoAccount` | Provisioned demo login + virtual balance (credentials encrypted at rest) |

## `provisionNewAccount(data)`

Full automation flow in one call:

1. Resolves `ChallengeConfig` from `modelType` + `accountSize` + firm program + `customRules` JSON
2. Creates `PropFirmAccount` + `ChallengeConfig` + `TraderDemoAccount`
3. Generates secure login credentials (`password` or `magic_link` mode)
4. Registers rules on the in-process **Risk Engine** (`lib/engine/risk.ts`)

```typescript
import { provisionNewAccount } from "@/services/account-provisioning";

const result = await provisionNewAccount({
  propFirmId: tenant.id,
  traderEmail: "trader@example.com",
  modelType: "2step",
  accountSize: "100K",
  customRules: {
    profitTarget: 9,
    minTradingDays: 8,
    maxExposurePerMarket: 8000,
  },
  loginMode: "password", // or "magic_link"
  activateImmediately: true,
});

// Deliver once via email/webhook — do not log result.credentials.password
await sendWelcomeEmail(result.credentials);
```

### Helper methods

| Function | Purpose |
| --- | --- |
| `resolveDefaultChallengeConfig()` | Baseline rules from model + size |
| `mergeChallengeConfig()` | Apply explicit partial overrides |
| `resolveChallengeConfigForAccount()` | Firm program + custom JSON + overrides |
| `syncRiskProfileFromDatabase()` | Re-register risk rules after cold start |

## API routes

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/platform/provisioning` | POST | Webhook / Super Admin provisioning |
| `/api/platform/provisioning?propFirmId=` | GET | List registered risk profiles |

## Apply schema

```bash
npx prisma db push
npx prisma generate
```

## Environment

- `SECRET_KEY` — JWT signing + magic links
- `CREDENTIALS_ENCRYPTION_KEY` — AES-256-GCM for stored login credentials (optional; falls back to `SECRET_KEY`)
- `APP_URL` — base URL for magic login links
