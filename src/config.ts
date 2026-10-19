import type { AutoSpawnParentGrant, ModelTarget, RouterPluginConfig, RouterTier } from "./types.js";

const DEFAULT_MODELS: Record<RouterTier, ModelTarget> = {
  SIMPLE: { provider: "openai", model: "gpt-6-luna" },
  MEDIUM: { provider: "openai", model: "gpt-6-luna" },
  COMPLEX: { provider: "openai", model: "gpt-6-sol" },
  REASONING: { provider: "openai", model: "gpt-6-sol" },
};

export const DEFAULT_PLUGIN_CONFIG: RouterPluginConfig = {
  mode: "shadow",
  ambiguousTier: "COMPLEX",
  protectManualSelection: true,
  requireSessionKeyForAuto: true,
  // AUTO is inert until an exact session or parent-incarnation grant exists.
  autoSessionKeyHashes: [],
  autoSpawnParentGrants: [],
  minAttachmentTier: "MEDIUM",
  models: DEFAULT_MODELS,
  stageRouting: { model: true, effort: false },
};

const TIERS: RouterTier[] = ["SIMPLE", "MEDIUM", "COMPLEX", "REASONING"];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTier(value: unknown): value is RouterTier {
  return typeof value === "string" && TIERS.includes(value as RouterTier);
}

function parseModelTarget(value: unknown, fallback: ModelTarget): ModelTarget {
  if (!isObject(value)) return fallback;
  const provider = typeof value.provider === "string" && value.provider ? value.provider : fallback.provider;
  const model = typeof value.model === "string" && value.model ? value.model : fallback.model;
  return { provider, model };
}

function parseAutoSpawnParentGrant(value: unknown): AutoSpawnParentGrant | undefined {
  if (!isObject(value)) return;
  const { parentSessionKeyHash, parentSessionId, parentLifecycleRevision, parentCreatorProfileId } = value;
  if (typeof parentSessionKeyHash !== "string" || !/^[a-f0-9]{64}$/.test(parentSessionKeyHash)) return;
  if ([parentSessionId, parentLifecycleRevision, parentCreatorProfileId]
    .some(field => typeof field !== "string" || !field.trim() || field !== field.trim())) return;
  return {
    parentSessionKeyHash,
    parentSessionId: parentSessionId as string,
    parentLifecycleRevision: parentLifecycleRevision as string,
    parentCreatorProfileId: parentCreatorProfileId as string,
  };
}

export function parsePluginConfig(raw: unknown): RouterPluginConfig {
  if (!isObject(raw)) return DEFAULT_PLUGIN_CONFIG;

  const mode = raw.mode === "off" || raw.mode === "shadow" || raw.mode === "auto"
    ? raw.mode
    : DEFAULT_PLUGIN_CONFIG.mode;

  const ambiguousTier = isTier(raw.ambiguousTier)
    ? raw.ambiguousTier
    : DEFAULT_PLUGIN_CONFIG.ambiguousTier;

  const minAttachmentTier = isTier(raw.minAttachmentTier)
    ? raw.minAttachmentTier
    : DEFAULT_PLUGIN_CONFIG.minAttachmentTier;

  const modelsRaw = isObject(raw.models) ? raw.models : {};
  const models = Object.fromEntries(
    TIERS.map((tier) => [tier, parseModelTarget(modelsRaw[tier], DEFAULT_MODELS[tier])]),
  ) as Record<RouterTier, ModelTarget>;

  const autoSessionKeyHashes = Array.isArray(raw.autoSessionKeyHashes)
    && raw.autoSessionKeyHashes.every(
      (value): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value),
    )
    ? raw.autoSessionKeyHashes
    : DEFAULT_PLUGIN_CONFIG.autoSessionKeyHashes;
  const parsedSpawnGrants = Array.isArray(raw.autoSpawnParentGrants)
    ? raw.autoSpawnParentGrants.map(parseAutoSpawnParentGrant)
    : [];
  const autoSpawnParentGrants = parsedSpawnGrants.every(Boolean)
    ? [...new Map(parsedSpawnGrants.map(grant => [JSON.stringify(grant), grant])).values()] as AutoSpawnParentGrant[]
    : DEFAULT_PLUGIN_CONFIG.autoSpawnParentGrants;

  return {
    mode,
    ambiguousTier,
    minAttachmentTier,
    protectManualSelection:
      typeof raw.protectManualSelection === "boolean"
        ? raw.protectManualSelection
        : DEFAULT_PLUGIN_CONFIG.protectManualSelection,
    requireSessionKeyForAuto:
      typeof raw.requireSessionKeyForAuto === "boolean"
        ? raw.requireSessionKeyForAuto
        : DEFAULT_PLUGIN_CONFIG.requireSessionKeyForAuto,
    autoSessionKeyHashes: [...new Set(autoSessionKeyHashes)],
    autoSpawnParentGrants,
    models,
    stageRouting: {
      model: isObject(raw.stageRouting) && typeof raw.stageRouting.model === "boolean" ? raw.stageRouting.model : true,
      effort: isObject(raw.stageRouting) && raw.stageRouting.effort === true,
    },
  };
}
