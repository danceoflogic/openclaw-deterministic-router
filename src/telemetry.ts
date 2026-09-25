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

type ModelCallEvent = {
  runId: string;
  callId: string;
  provider: string;
  model: string;
  api?: string;
  transport?: string;
};

type ModelCallEndedEvent = ModelCallEvent & {
  durationMs: number;
  outcome: "completed" | "error";
  errorCategory?: string;
};

export type ModelCallTelemetryRecord = {
  timestamp: string;
  kind: "model_call_started" | "model_call_ended";
  runId: string;
  callId: string;
  decisionId?: string;
  mode?: RouterMode;
  selectedProvider?: string;
  selectedModel?: string;
  effectiveProvider: string;
  effectiveModel: string;
  api?: string;
  transport?: string;
  durationMs?: number;
  outcome?: "completed" | "error";
  errorCategory?: string;
};

export type CorrelatedModelCall = {
  runId: string;
  callId: string;
  started?: ModelCallTelemetryRecord;
  ended?: ModelCallTelemetryRecord;
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

/**
 * Keeps router decisions and sanitized OpenClaw model-call events correlated by
 * runId. Each callId is retained independently so retries are never collapsed.
 */
export class ModelCallCorrelationRegistry {
  private readonly decisionsByRun = new Map<string, AuditRecord[]>();
  private readonly callsByRun = new Map<string, Map<string, CorrelatedModelCall>>();

  recordDecision(decision: AuditRecord): void {
    if (!decision.runId) return;
    const decisions = this.decisionsByRun.get(decision.runId) ?? [];
    decisions.push(decision);
    this.decisionsByRun.set(decision.runId, decisions);
  }

  recordCallStarted(event: ModelCallEvent): ModelCallTelemetryRecord {
    const record = this.makeRecord(event, "model_call_started");
    const call = this.getOrCreateCall(event.runId, event.callId);
    call.started = record;
    return record;
  }

  recordCallEnded(event: ModelCallEndedEvent): ModelCallTelemetryRecord {
    const record = this.makeRecord(event, "model_call_ended", event);
    const call = this.getOrCreateCall(event.runId, event.callId);
    call.ended = record;
    return record;
  }

  callsForRun(runId: string): CorrelatedModelCall[] {
    return [...(this.callsByRun.get(runId)?.values() ?? [])];
  }

  private getOrCreateCall(runId: string, callId: string): CorrelatedModelCall {
    const calls = this.callsByRun.get(runId) ?? new Map<string, CorrelatedModelCall>();
    const call = calls.get(callId) ?? { runId, callId };
    calls.set(callId, call);
    this.callsByRun.set(runId, calls);
    return call;
  }

  private makeRecord(
    event: ModelCallEvent,
    kind: ModelCallTelemetryRecord["kind"],
    ended?: ModelCallEndedEvent,
  ): ModelCallTelemetryRecord {
    const selected = this.decisionsByRun.get(event.runId)?.at(-1);

    return {
      timestamp: new Date().toISOString(),
      kind,
      runId: event.runId,
      callId: event.callId,
      decisionId: selected?.decisionId,
      mode: selected?.mode,
      selectedProvider: selected?.selectedProvider,
      selectedModel: selected?.selectedModel,
      effectiveProvider: event.provider,
      effectiveModel: event.model,
      api: event.api,
      transport: event.transport,
      durationMs: ended?.durationMs,
      outcome: ended?.outcome,
      errorCategory: ended?.errorCategory,
    };
  }
}
