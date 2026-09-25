import type { ModelTarget, RouterPluginConfig, RouterTier } from "./types.js";

const DEFAULT_MODELS: Record<RouterTier, ModelTarget> = {
  SIMPLE: { provider: "telnyx", model: "MiniMaxAI/MiniMax-M3-MXFP8" },
  MEDIUM: { provider: "openai", model: "gpt-5.6-luna" },
  COMPLEX: { provider: "openai", model: "gpt-5.6-terra" },
  REASONING: { provider: "openai", model: "gpt-5.6-sol" },
};

export const DEFAULT_PLUGIN_CONFIG: RouterPluginConfig = {
  mode: "shadow",
  ambiguousTier: "COMPLEX",
  protectManualSelection: true,
  requireSessionKeyForAuto: true,
  minAttachmentTier: "MEDIUM",
  models: DEFAULT_MODELS,
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
    models,
  };
}
