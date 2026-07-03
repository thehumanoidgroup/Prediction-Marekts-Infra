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
// Emails are sent automatically when provisioning completes (see services/email.ts).
```

### Helper methods

| Function | Purpose |
| --- | --- |
| `resolveDefaultChallengeConfig()` | Baseline rules from model + size |
| `mergeChallengeConfig()` | Apply explicit partial overrides |
| `resolveChallengeConfigForAccount()` | Firm program + custom JSON + overrides |
| `syncRiskProfileFromDatabase()` | Re-register risk rules after cold start |

## Provisioning emails

Automated emails are sent after successful provisioning via **`services/email.ts`**
(equivalent to the requested `backend/services/email_service.py`).

| Function | Recipient | Content |
| --- | --- | --- |
| `sendTraderCredentials()` | Trader | Login link or credentials, account size, model type, challenge rules, support contact |
| `sendPropFirmNotification()` | Prop firm admin | Account details summary, trader email, challenge rules |
| `sendProvisioningEmails()` | Both | Called automatically from `provisionNewAccount()` |

Templates live in `lib/email/templates.ts`. Delivery uses [Resend](https://resend.com) when
`RESEND_API_KEY` is set; otherwise emails are logged to the console in development.

Set `sendEmails: false` on `provisionNewAccount()` or `send_emails: false` on webhook/manual
payloads to skip delivery. API responses omit raw `credentials` when the trader email was sent
successfully.

## API routes

| Route | Method | Auth | Purpose |
| --- | --- | --- | --- |
| `/api/provisioning/webhook` | POST | `X-API-Key` (per firm) | Prop firm checkout webhook |
| `/api/provisioning/manual` | POST | Super Admin JWT | Manual account creation |
| `/api/provisioning/accounts` | GET | Super Admin JWT | List sold accounts (filterable) |
| `/api/provisioning/accounts/{id}` | GET | Super Admin JWT | Single account detail |

### Webhook example

```bash
curl -X POST https://your-app.vercel.app/api/provisioning/webhook \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ppk_..." \
  -d '{
    "prop_firm_id": "uuid",
    "trader_email": "buyer@example.com",
    "model_type": "2step",
    "account_size": "100K",
    "custom_rules": { "profitTarget": 9 }
  }'
```

Webhook API keys are created per tenant on first `ensureSeeded()` run (logged in development).

## Apply schema

```bash
npx prisma db push
npx prisma generate
```

## Environment

- `SECRET_KEY` — JWT signing + magic links
- `CREDENTIALS_ENCRYPTION_KEY` — AES-256-GCM for stored login credentials (optional; falls back to `SECRET_KEY`)
- `APP_URL` — base URL for magic login links
- `RESEND_API_KEY` — Resend API key for production email delivery
- `EMAIL_FROM` — sender address (default: `PropPredict <onboarding@resend.dev>`)
- `SUPPORT_EMAIL` — support contact shown in provisioning emails
- `PROVISIONING_EMAILS_ENABLED` — set to `false` to disable all provisioning emails
