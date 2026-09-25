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

type SelectedDecision = Pick<
  AuditRecord,
  "decisionId" | "mode" | "selectedProvider" | "selectedModel"
>;

type ActiveCall = CorrelatedModelCall & {
  selected?: SelectedDecision;
};

type RunCorrelation = {
  decision?: SelectedDecision;
  calls: Map<string, ActiveCall>;
  lastTouched: number;
  sequence: number;
  /** Set once OpenClaw reports that this run has ended. */
  terminalAt?: number;
};

export type ModelCallCorrelationRegistryOptions = {
  /** Injectable clock so stale-entry cleanup is deterministic in tests. */
  now?: () => number;
  /** Maximum completed/inactive runs retained as a backstop for missing lifecycle events. */
  maxInactiveRuns?: number;
  /** Age after which an inactive run is discarded as a backstop for missing lifecycle events. */
  staleRunMs?: number;
  /** How long to retain a terminal run marker to reject late lifecycle events. */
  terminalGraceMs?: number;
  /** Maximum drained terminal run markers retained during their grace period. */
  maxTerminalRuns?: number;
};

const DEFAULT_MAX_INACTIVE_RUNS = 1024;
const DEFAULT_STALE_RUN_MS = 60 * 60 * 1000;
const DEFAULT_TERMINAL_GRACE_MS = 5 * 60 * 1000;
const DEFAULT_MAX_TERMINAL_RUNS = 1024;

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
  private readonly runs = new Map<string, RunCorrelation>();
  private readonly now: () => number;
  private readonly maxInactiveRuns: number;
  private readonly staleRunMs: number;
  private readonly terminalGraceMs: number;
  private readonly maxTerminalRuns: number;
  private sequence = 0;

  constructor(options: ModelCallCorrelationRegistryOptions = {}) {
    this.now = options.now ?? Date.now;
    this.maxInactiveRuns = options.maxInactiveRuns ?? DEFAULT_MAX_INACTIVE_RUNS;
    this.staleRunMs = options.staleRunMs ?? DEFAULT_STALE_RUN_MS;
    this.terminalGraceMs = options.terminalGraceMs ?? DEFAULT_TERMINAL_GRACE_MS;
    this.maxTerminalRuns = options.maxTerminalRuns ?? DEFAULT_MAX_TERMINAL_RUNS;
  }

  recordDecision(decision: AuditRecord): void {
    if (!decision.runId) return;
    const existing = this.runs.get(decision.runId);
    // A terminal marker must never be revived by delayed routing events.
    if (existing?.terminalAt !== undefined) {
      this.pruneInactiveRuns();
      return;
    }
    const run = existing ?? this.getOrCreateRun(decision.runId);
    run.decision = this.snapshotDecision(decision);
    this.touch(run);
    this.pruneInactiveRuns();
  }

  recordCallStarted(event: ModelCallEvent): ModelCallTelemetryRecord {
    const existing = this.runs.get(event.runId);
    // Keep a terminal run terminal. A late start cannot create an unbounded
    // active entry after OpenClaw has authoritatively completed the run.
    if (existing?.terminalAt !== undefined) {
      this.pruneInactiveRuns();
      return this.makeRecord(event, "model_call_started");
    }
    const run = existing ?? this.getOrCreateRun(event.runId);
    const call = run.calls.get(event.callId) ?? {
      runId: event.runId,
      callId: event.callId,
      // Bind the decision at the first start event. Do not let duplicate starts
      // or later decisions change this call's routing attribution.
      selected: run.decision,
    };
    run.calls.set(event.callId, call);
    this.touch(run);

    const record = this.makeRecord(event, "model_call_started", call.selected);
    call.started ??= record;
    this.pruneInactiveRuns();
    return record;
  }

  recordCallEnded(event: ModelCallEndedEvent): ModelCallTelemetryRecord {
    const run = this.runs.get(event.runId);
    const call = run?.calls.get(event.callId);
    // An end without a matching start is intentionally uncorrelated: looking
    // up the latest run decision here could assign it to a newer call.
    const record = this.makeRecord(event, "model_call_ended", call?.selected, event);
    if (run && call) {
      call.ended = record;
      run.calls.delete(event.callId);
      this.touch(run);
    }
    this.pruneInactiveRuns();
    return record;
  }

  callsForRun(runId: string): CorrelatedModelCall[] {
    return [...(this.runs.get(runId)?.calls.values() ?? [])].map(({ selected: _selected, ...call }) => call);
  }

  /**
   * Marks a run terminal when OpenClaw authoritatively ends it. Active calls
   * are deliberately retained: their queued end events still need the snapshot
   * captured at start. Once drained, a bounded terminal marker rejects late
   * events before deterministic grace/capacity cleanup removes it.
   */
  completeRun(runId: string | undefined): void {
    if (typeof runId !== "string" || runId.length === 0) return;
    const run = this.runs.get(runId) ?? this.getOrCreateRun(runId);
    run.terminalAt ??= this.now();
    this.touch(run);
    this.pruneInactiveRuns();
  }

  private getOrCreateRun(runId: string): RunCorrelation {
    const existing = this.runs.get(runId);
    if (existing) return existing;

    const run: RunCorrelation = {
      calls: new Map(),
      lastTouched: this.now(),
      sequence: ++this.sequence,
    };
    this.runs.set(runId, run);
    return run;
  }

  private touch(run: RunCorrelation): void {
    run.lastTouched = this.now();
    run.sequence = ++this.sequence;
  }

  private snapshotDecision(decision: AuditRecord): SelectedDecision {
    return {
      decisionId: decision.decisionId,
      mode: decision.mode,
      selectedProvider: decision.selectedProvider,
      selectedModel: decision.selectedModel,
    };
  }

  private pruneInactiveRuns(): void {
    const now = this.now();
    const inactive: Array<[string, RunCorrelation]> = [];
    const terminal: Array<[string, RunCorrelation]> = [];

    for (const entry of this.runs) {
      const [runId, run] = entry;
      if (run.calls.size > 0) continue;
      if (run.terminalAt !== undefined) {
        if (now - run.terminalAt >= this.terminalGraceMs) {
          this.runs.delete(runId);
        } else {
          terminal.push(entry);
        }
        continue;
      }
      if (now - run.lastTouched >= this.staleRunMs) {
        this.runs.delete(runId);
      } else {
        inactive.push(entry);
      }
    }

    this.pruneByCapacity(terminal, this.maxTerminalRuns);
    this.pruneByCapacity(inactive, this.maxInactiveRuns);
  }

  private pruneByCapacity(
    runs: Array<[string, RunCorrelation]>,
    maximum: number,
  ): void {
    if (runs.length <= maximum) return;
    runs.sort(([, left], [, right]) =>
      left.lastTouched - right.lastTouched || left.sequence - right.sequence,
    );
    for (const [runId] of runs.slice(0, runs.length - maximum)) {
      this.runs.delete(runId);
    }
  }

  private makeRecord(
    event: ModelCallEvent,
    kind: ModelCallTelemetryRecord["kind"],
    selected?: SelectedDecision,
    ended?: ModelCallEndedEvent,
  ): ModelCallTelemetryRecord {
    return {
      timestamp: new Date(this.now()).toISOString(),
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
