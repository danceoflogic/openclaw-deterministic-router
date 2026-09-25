import type { RouterPluginConfig, RouterTier } from "./types.js";

const TIER_RANK: Record<RouterTier, number> = {
  SIMPLE: 0,
  MEDIUM: 1,
  COMPLEX: 2,
  REASONING: 3,
};

export function maxTier(a: RouterTier, b: RouterTier): RouterTier {
  return TIER_RANK[a] >= TIER_RANK[b] ? a : b;
}

export function resolveTier(
  classifierTier: RouterTier | null,
  attachmentCount: number,
  config: RouterPluginConfig,
): RouterTier {
  const base = classifierTier ?? config.ambiguousTier;
  return attachmentCount > 0 ? maxTier(base, config.minAttachmentTier) : base;
}
