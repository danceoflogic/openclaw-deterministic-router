import { createHash, randomUUID } from "node:crypto";
import type { RouteWorkDecision, RouterMode } from "./types.js";

export type AuditRecord = {
  timestamp: string;
  decisionId: string;
  runId?: string;
  sessionKeyHash?: string;
  agentId?: string;
  mode: RouterMode;
  classifierTier: string | null;
  effectiveTier: string;
  score: number;
  confidence: number;
  selectedProvider: string;
  selectedModel: string;
  manualLock: boolean;
  applied: boolean;
  reason: string;
};

function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

export function makeAuditRecord(params: {
  decision: RouteWorkDecision;
  mode: RouterMode;
  sessionKey?: string;
  agentId?: string;
  runId?: string;
  manualLock: boolean;
  applied: boolean;
  reason?: string;
}): AuditRecord {
  return {
    timestamp: new Date().toISOString(),
    decisionId: randomUUID(),
    runId: params.runId,
    sessionKeyHash: params.sessionKey ? shortHash(params.sessionKey) : undefined,
    agentId: params.agentId,
    mode: params.mode,
    classifierTier: params.decision.classifierTier,
    effectiveTier: params.decision.effectiveTier,
    score: params.decision.score,
    confidence: params.decision.confidence,
    selectedProvider: params.decision.target.provider,
    selectedModel: params.decision.target.model,
    manualLock: params.manualLock,
    applied: params.applied,
    reason: params.reason ?? params.decision.reason,
  };
}
