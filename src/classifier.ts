import { classifyByRules, DEFAULT_ROUTING_CONFIG } from "@blockrun/router-core";
import type { RouterTier } from "./types.js";

/**
 * Deliberate plugin-local experiment: widen the upper direct-COMPLEX band
 * without changing pinned Router Core, other scoring parameters, or policy.
 *
 * This also moves the score-based REASONING boundary, so preserve the pinned
 * two-marker reasoning override and review the resulting tier distribution.
 */
export const ROUTER_SCORING_CONFIG = {
  ...DEFAULT_ROUTING_CONFIG.scoring,
  tierBoundaries: {
    ...DEFAULT_ROUTING_CONFIG.scoring.tierBoundaries,
    complexReasoning: 0.53,
  },
};

export type LocalClassification = {
  tier: RouterTier | null;
  score: number;
  confidence: number;
  signals: string[];
};

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

/**
 * Run Router Core's deterministic 15-dimension rules classifier only.
 *
 * We deliberately do not call Router Core's optional LLM fallback for ambiguous
 * classifications. Ambiguity is resolved later by our deterministic policy.
 */
export function classifyLocally(prompt: string): LocalClassification {
  const result = classifyByRules(
    prompt,
    undefined,
    estimateTokens(prompt),
    ROUTER_SCORING_CONFIG,
  );

  return {
    tier: result.tier,
    score: result.score,
    confidence: result.confidence,
    signals: result.signals,
  };
}
