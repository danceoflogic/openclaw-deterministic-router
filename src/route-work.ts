import { classifyLocally } from "./classifier.js";
import { resolveTier } from "./policy.js";
import type { RouteWorkDecision, RouteWorkInput, RouterPluginConfig } from "./types.js";

export function routeWork(input: RouteWorkInput, config: RouterPluginConfig): RouteWorkDecision {
  const classification = classifyLocally(input.prompt);
  const attachmentCount = input.attachmentCount ?? 0;
  const effectiveTier = resolveTier(classification.tier, attachmentCount, config);
  const target = config.models[effectiveTier];

  const reason = classification.tier === null
    ? `ambiguous classifier result; deterministic fallback=${effectiveTier}`
    : attachmentCount > 0 && effectiveTier !== classification.tier
      ? `classifier=${classification.tier}; attachment floor promoted to ${effectiveTier}`
      : `classifier=${effectiveTier}`;

  return {
    classifierTier: classification.tier,
    effectiveTier,
    confidence: classification.confidence,
    score: classification.score,
    signals: classification.signals,
    target,
    reason,
  };
}
