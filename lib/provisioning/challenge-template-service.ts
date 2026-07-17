/**
 * Per-firm challenge templates by model type (1step / 2step / 3step / instant).
 *
 * TypeScript counterpart to `backend/services/challenge_template_service.py`
 * for the Prop Firm Admin dashboard (Prisma / Next.js BFF).
 */

import type { PropFirmModelType } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  CHALLENGE_MODEL_TYPES,
  getDefaultTemplateFields,
  type ChallengeTemplateSaveInput,
  type ChallengeTemplateView,
} from "@/lib/provisioning/challenge-template-defaults";
import {
  fromApiModelType,
  serializePropFirmChallengeTemplate,
  toApiModelType,
} from "@/lib/provisioning/serialize";
import type { PropFirmModelType as ApiModelType } from "@/types/provisioning";

export {
  CHALLENGE_MODEL_TYPES,
  CHALLENGE_TEMPLATE_DEFAULTS,
  getDefaultTemplateFields,
  type ChallengeTemplateSaveInput,
  type ChallengeTemplateView,
} from "@/lib/provisioning/challenge-template-defaults";

function defaultView(propFirmId: string, modelType: ApiModelType): ChallengeTemplateView {
  const defaults = getDefaultTemplateFields(modelType);
  return {
    id: "",
    propFirmId,
    modelType,
    profitTarget: defaults.profitTarget,
    dailyDrawdown: defaults.dailyDrawdown,
    maxDrawdown: defaults.maxDrawdown,
    maxBetSizePerPick: defaults.maxBetSizePerPick,
    maxBetSizeMode: defaults.maxBetSizeMode,
    maxBetSizeRules: null,
    consistencyScore: defaults.consistencyScore ?? null,
    minTradingDays: defaults.minTradingDays ?? null,
    otherRules: { ...(defaults.otherRules ?? {}) },
    createdAt: "",
    updatedAt: "",
    isDefault: true,
  };
}

function toView(
  row: import("@prisma/client").PropFirmChallengeTemplate,
): ChallengeTemplateView {
  return {
    ...serializePropFirmChallengeTemplate(row),
    isDefault: false,
  };
}

function toJsonInput(
  value: Record<string, unknown> | null | undefined,
): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
}

/** Load saved template or built-in defaults for one model type. */
export async function getTemplateForModel(
  propFirmId: string,
  modelType: ApiModelType,
): Promise<ChallengeTemplateView> {
  const prismaModel = fromApiModelType(modelType);
  const row = await prisma.propFirmChallengeTemplate.findUnique({
    where: {
      propFirmId_modelType: { propFirmId, modelType: prismaModel },
    },
  });
  return row ? toView(row) : defaultView(propFirmId, modelType);
}

/** All four model types — fills missing ones with platform defaults. */
export async function getAllTemplatesForPropFirm(
  propFirmId: string,
): Promise<ChallengeTemplateView[]> {
  const rows = await prisma.propFirmChallengeTemplate.findMany({
    where: { propFirmId },
  });
  const byType = new Map<ApiModelType, ChallengeTemplateView>();
  for (const row of rows) {
    byType.set(toApiModelType(row.modelType), toView(row));
  }
  return CHALLENGE_MODEL_TYPES.map(
    (modelType) => byType.get(modelType) ?? defaultView(propFirmId, modelType),
  );
}

/** Create or update the unique (propFirmId, modelType) template. */
export async function saveOrUpdateTemplate(
  propFirmId: string,
  modelType: ApiModelType,
  data: ChallengeTemplateSaveInput,
): Promise<ChallengeTemplateView> {
  const prismaModel = fromApiModelType(modelType);
  const defaults = getDefaultTemplateFields(modelType);
  if (!(data.maxDrawdown > data.dailyDrawdown)) {
    throw new Error("Max drawdown must be greater than daily drawdown");
  }
  const payload = {
    profitTarget: data.profitTarget,
    dailyDrawdown: data.dailyDrawdown,
    maxDrawdown: data.maxDrawdown,
    maxBetSizePerPick: data.maxBetSizePerPick,
    maxBetSizeMode: data.maxBetSizeMode,
    maxBetSizeRules: toJsonInput(data.maxBetSizeRules ?? null),
    consistencyScore:
      data.consistencyScore === undefined ? defaults.consistencyScore : data.consistencyScore,
    minTradingDays:
      data.minTradingDays === undefined ? defaults.minTradingDays : data.minTradingDays,
    otherRules: toJsonInput(data.otherRules ?? defaults.otherRules ?? {}) as Prisma.InputJsonValue,
  };

  const row = await prisma.propFirmChallengeTemplate.upsert({
    where: {
      propFirmId_modelType: { propFirmId, modelType: prismaModel },
    },
    create: {
      propFirmId,
      modelType: prismaModel,
      ...payload,
    },
    update: payload,
  });
  return toView(row);
}

/** Delete saved template so the firm falls back to platform defaults. */
export async function resetTemplateToDefaults(
  propFirmId: string,
  modelType: ApiModelType,
): Promise<ChallengeTemplateView> {
  const prismaModel = fromApiModelType(modelType) as PropFirmModelType;
  await prisma.propFirmChallengeTemplate.deleteMany({
    where: { propFirmId, modelType: prismaModel },
  });
  return defaultView(propFirmId, modelType);
}
