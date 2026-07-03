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

End-to-end automation in one call (sync) or via the background queue (async):

1. Resolves `ChallengeConfig` from `modelType` + `accountSize` + firm program + `customRules` JSON
2. Creates `PropFirmAccount` (pending) + `ChallengeConfig` + `TraderDemoAccount` with encrypted credentials
3. Registers rules on the in-process **Risk Engine** (`lib/engine/risk.ts`)
4. Sends trader + prop firm emails (`services/email.ts`)
5. Updates account status to **`provisioned`** (or `activated` when `activateImmediately: true`)
6. Logs the event in the Super Admin activity feed (`lib/platform/activity.ts`)

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
});

// Credentials are emailed automatically — do not log result.credentials.password
```

### Async queue (high volume)

Set `PROVISIONING_ASYNC=true` or pass `"async": true` on webhook/manual payloads to enqueue
instead of blocking the HTTP request. Jobs are stored in `provisioning_jobs` and processed by
`POST /api/internal/provisioning/process` (triggered automatically after enqueue).

Poll job status: `GET /api/provisioning/jobs/{id}` (Super Admin JWT).

For Redis/Celery-style external workers, poll `provisioning_jobs` where `status = pending`
or call the internal worker route on a schedule.

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

## Prop firm default settings (`PropFirmSettings`)

Per-firm provisioning defaults live in the `prop_firm_settings` table (1:1 with `Tenant`):

| Field | Purpose |
| --- | --- |
| `allowedModelTypes` | Model types the firm sells (`1step`, `2step`, …) |
| `allowedAccountSizes` | Account size tiers available at checkout |
| `modelDefaults` | Default challenge rules per model type |
| `allowedOverrideFields` | `custom_rules` keys purchasers may override |
| `defaultCustomRules` | Firm-wide JSON merged into every account |

Resolution order at provisioning: platform preset → `Tenant.program` → `PropFirmSettings.modelDefaults` → filtered purchase `custom_rules`.

Configure from **Prop Firm Admin → Provisioning** (`/admin/provisioning`) or `PATCH /api/admin/provisioning-settings`.

## Security and validation

- **Credential encryption:** `TraderDemoAccount.login_credentials` are encrypted with AES-256-GCM (`lib/provisioning/crypto.ts`). Set `CREDENTIALS_ENCRYPTION_KEY` in production.
- **`custom_rules` validation:** Flat JSON only; known fields with type/range checks (`lib/schemas/custom-rules.ts`). Unknown keys and nested objects are rejected.
- **Audit logging:** Every provisioning attempt is recorded in `provisioning_audit_logs` (success, failed, queued).
- **Webhook rate limiting:** Configurable per firm + API key + IP (`PROVISIONING_WEBHOOK_RATE_LIMIT`, default 60/min).

## API routes

| Route | Method | Auth | Purpose |
| --- | --- | --- | --- |
| `/api/provisioning/webhook` | POST | `X-API-Key` (per firm) | Prop firm checkout webhook |
| `/api/provisioning/manual` | POST | Super Admin JWT | Manual account creation |
| `/api/provisioning/accounts` | GET | Super Admin JWT | List sold accounts (filterable) |
| `/api/provisioning/accounts/{id}` | GET | Super Admin JWT | Single account detail |
| `/api/provisioning/jobs/{id}` | GET | Super Admin JWT | Async job status |
| `/api/internal/provisioning/process` | POST | Worker secret | Background job processor |

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
- `PROVISIONING_ASYNC` — enqueue provisioning instead of inline processing
- `PROVISIONING_QUEUE` — set to `database` for async queue mode
- `PROVISIONING_WORKER_SECRET` — Bearer token for the internal worker route
