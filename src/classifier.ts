import { classifyByRules, DEFAULT_ROUTING_CONFIG } from "@blockrun/router-core";
import type { RouterTier } from "./types.js";

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
    DEFAULT_ROUTING_CONFIG.scoring,
  );

  return {
    tier: result.tier,
    score: result.score,
    confidence: result.confidence,
    signals: result.signals,
  };
}
