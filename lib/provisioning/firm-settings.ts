/**
 * Load, persist, and validate per-firm provisioning settings.
 */

import type { PropFirmSettings } from "@prisma/client";
import { prisma } from "@/lib/db";
import { MODEL_PRESETS } from "@/lib/provisioning/default-rules";
import {
  fromApiAccountSize,
  fromApiModelType,
  toApiAccountSize,
  toApiModelType,
} from "@/lib/provisioning/serialize";
import { propFirmSettingsPatchSchema } from "@/lib/schemas/firm-settings";
import type { TenantProgram } from "@/lib/tenants";
import {
  ALL_ACCOUNT_SIZES,
  ALL_MODEL_TYPES,
  DEFAULT_ALLOWED_OVERRIDE_FIELDS,
  type ModelDefaultsMap,
  type ModelTypeDefaults,
  type PropFirmSettingsInput,
  type PropFirmSettingsRecord,
} from "@/types/firm-settings";
import type { AccountSize, PropFirmModelType } from "@/types/provisioning";
import { ProvisioningError } from "@/lib/provisioning/errors";

function usdToAccountSize(usd: number): AccountSize | null {
  const map: Record<number, AccountSize> = {
    10_000: "10K",
    25_000: "25K",
    50_000: "50K",
    100_000: "100K",
    500_000: "500K",
    1_000_000: "1M",
    2_000_000: "2M",
  };
  return map[usd] ?? null;
}

function accountSizesFromProgram(program: Partial<TenantProgram>): AccountSize[] {
  const sizes = (program.accountSizes ?? [])
    .map((n) => usdToAccountSize(n))
    .filter((s): s is AccountSize => s !== null);
  return sizes.length > 0 ? [...new Set(sizes)] : ["10K", "25K", "50K", "100K"];
}

function buildModelDefaultsFromProgram(program: Partial<TenantProgram>): ModelDefaultsMap {
  const shared: ModelTypeDefaults = {
    profitTarget: program.profitTargetPct,
    dailyDrawdown: program.maxDailyLossPct,
    maxDrawdown: program.maxDrawdownPct,
    minTradingDays: program.minTradingDays,
    challengeDurationDays: program.challengeDurationDays,
    maxStakePerOrder: program.maxStakePerOrder,
    maxExposurePerMarket: program.maxExposurePerMarket,
    drawdownMode: program.drawdownMode,
    profitSplitPct: program.profitSplitPct,
  };

  const result: ModelDefaultsMap = {};
  for (const modelType of ALL_MODEL_TYPES) {
    const preset = MODEL_PRESETS[modelType];
    result[modelType] = {
      ...shared,
      profitTarget: shared.profitTarget ?? preset.profitTarget,
      dailyDrawdown: shared.dailyDrawdown ?? preset.dailyDrawdown,
      maxDrawdown: shared.maxDrawdown ?? preset.maxDrawdown,
      minTradingDays: shared.minTradingDays ?? preset.minTradingDays,
      challengeDurationDays: shared.challengeDurationDays ?? preset.challengeDurationDays,
      consistencyScore: preset.consistencyScore ?? null,
      maxBetSizeMode: "percent",
      maxBetSizeValue: preset.maxBetSizePct,
    };
  }
  return result;
}

function parseModelDefaults(raw: unknown): ModelDefaultsMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const input = raw as Record<string, unknown>;
  const result: ModelDefaultsMap = {};
  for (const modelType of ALL_MODEL_TYPES) {
    const entry = input[modelType];
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      result[modelType] = entry as ModelTypeDefaults;
    }
  }
  return result;
}

function parseStringArray(raw: unknown, fallback: string[]): string[] {
  if (!Array.isArray(raw)) return fallback;
  return raw.filter((v): v is string => typeof v === "string" && v.length > 0);
}

function parseCustomRules(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as Record<string, unknown>;
}

export function serializeFirmSettings(row: PropFirmSettings): PropFirmSettingsRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    allowedModelTypes: row.allowedModelTypes.map((m) => toApiModelType(m)),
    allowedAccountSizes: row.allowedAccountSizes.map((s) => toApiAccountSize(s)),
    modelDefaults: parseModelDefaults(row.modelDefaults),
    allowedOverrideFields: parseStringArray(
      row.allowedOverrideFields,
      [...DEFAULT_ALLOWED_OVERRIDE_FIELDS],
    ),
    defaultCustomRules: parseCustomRules(row.defaultCustomRules),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getFirmSettingsByTenantId(
  tenantId: string,
): Promise<PropFirmSettingsRecord | null> {
  const row = await prisma.propFirmSettings.findUnique({ where: { tenantId } });
  return row ? serializeFirmSettings(row) : null;
}

export async function getOrCreateFirmSettings(
  tenantId: string,
  program?: Partial<TenantProgram>,
): Promise<PropFirmSettingsRecord> {
  const existing = await prisma.propFirmSettings.findUnique({ where: { tenantId } });
  if (existing) return serializeFirmSettings(existing);

  const firmProgram =
    program ??
    (await prisma.tenant.findUnique({ where: { id: tenantId } }))?.program;

  const programObj =
    firmProgram && typeof firmProgram === "object" && !Array.isArray(firmProgram)
      ? (firmProgram as Partial<TenantProgram>)
      : {};

  const created = await prisma.propFirmSettings.create({
    data: {
      tenantId,
      allowedModelTypes: ALL_MODEL_TYPES.map((m) => fromApiModelType(m)),
      allowedAccountSizes: accountSizesFromProgram(programObj).map((s) =>
        fromApiAccountSize(s),
      ),
      modelDefaults: buildModelDefaultsFromProgram(programObj) as object,
      allowedOverrideFields: [...DEFAULT_ALLOWED_OVERRIDE_FIELDS],
      defaultCustomRules: {},
    },
  });

  return serializeFirmSettings(created);
}

export async function patchFirmSettings(
  tenantId: string,
  patch: PropFirmSettingsInput,
): Promise<PropFirmSettingsRecord> {
  const data = propFirmSettingsPatchSchema.parse(patch);
  await getOrCreateFirmSettings(tenantId);

  const current = await prisma.propFirmSettings.findUniqueOrThrow({ where: { tenantId } });
  const currentDefaults = parseModelDefaults(current.modelDefaults);

  const updated = await prisma.propFirmSettings.update({
    where: { tenantId },
    data: {
      allowedModelTypes: data.allowedModelTypes?.map((m) => fromApiModelType(m)),
      allowedAccountSizes: data.allowedAccountSizes?.map((s) => fromApiAccountSize(s)),
      modelDefaults: data.modelDefaults
        ? ({ ...currentDefaults, ...data.modelDefaults } as object)
        : undefined,
      allowedOverrideFields: data.allowedOverrideFields,
      defaultCustomRules: data.defaultCustomRules as object | undefined,
    },
  });

  return serializeFirmSettings(updated);
}

export function validateProvisioningAgainstSettings(
  settings: PropFirmSettingsRecord,
  modelType: PropFirmModelType,
  accountSize: AccountSize,
): void {
  if (!settings.allowedModelTypes.includes(modelType)) {
    throw new ProvisioningError({
      code: "MODEL_TYPE_NOT_ALLOWED",
      message: `Model type "${modelType}" is not enabled for this prop firm.`,
      userMessage: `This firm does not sell ${modelType} evaluations. Allowed types: ${settings.allowedModelTypes.join(", ")}.`,
      status: 422,
      details: {
        modelType,
        allowedModelTypes: settings.allowedModelTypes,
      },
    });
  }
  if (!settings.allowedAccountSizes.includes(accountSize)) {
    throw new ProvisioningError({
      code: "ACCOUNT_SIZE_NOT_ALLOWED",
      message: `Account size "${accountSize}" is not sold by this prop firm.`,
      userMessage: `This firm does not offer ${accountSize} accounts. Allowed sizes: ${settings.allowedAccountSizes.join(", ")}.`,
      status: 422,
      details: {
        accountSize,
        allowedAccountSizes: settings.allowedAccountSizes,
      },
    });
  }
}

/** Strip purchase overrides the firm has not allowed. */
export function filterAllowedPurchaseOverrides(
  settings: PropFirmSettingsRecord,
  customRules?: Record<string, unknown>,
): Record<string, unknown> {
  if (!customRules) return {};

  const allowed = new Set(settings.allowedOverrideFields);
  const filtered: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(customRules)) {
    if (allowed.has(key)) {
      filtered[key] = value;
    }
  }

  return filtered;
}

export function getModelDefaultsForType(
  settings: PropFirmSettingsRecord,
  modelType: PropFirmModelType,
): ModelTypeDefaults {
  return settings.modelDefaults[modelType] ?? {};
}

export function modelDefaultsToCustomRules(
  defaults: ModelTypeDefaults,
): Record<string, unknown> {
  const rules: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(defaults)) {
    if (value !== undefined) rules[key] = value;
  }
  return rules;
}

/** Ensure every tenant has settings rows (idempotent). */
export async function ensureFirmSettingsSeeded(): Promise<void> {
  if (!process.env.DATABASE_URL) return;

  const tenants = await prisma.tenant.findMany({ select: { id: true, program: true } });
  for (const tenant of tenants) {
    const program =
      tenant.program && typeof tenant.program === "object" && !Array.isArray(tenant.program)
        ? (tenant.program as Partial<TenantProgram>)
        : undefined;
    await getOrCreateFirmSettings(tenant.id, program);
  }
}

export { ALL_ACCOUNT_SIZES, ALL_MODEL_TYPES, DEFAULT_ALLOWED_OVERRIDE_FIELDS };
