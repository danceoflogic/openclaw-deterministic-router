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

/**
 * Metadata-only native-harness diagnostic events exposed by OpenClaw's
 * diagnostic SDK. Codex 2026.9.6 emits these at turn scope, not provider
 * request scope; the observation unit is required so callers cannot confuse
 * this surface with the embedded model_call_* hooks.
 */
type NativeModelCallDiagnosticBase = {
  runId: string;
  callId: string;
  provider: string;
  model: string;
  api?: string;
  transport?: string;
  observationUnit: "turn";
};

export type NativeModelCallDiagnosticEvent =
  | (NativeModelCallDiagnosticBase & {
    type: "model.call.started";
  })
  | (NativeModelCallDiagnosticBase & {
    type: "model.call.completed";
    durationMs: number;
  })
  | (NativeModelCallDiagnosticBase & {
    type: "model.call.error";
    durationMs: number;
    errorCategory: string;
  });

type NativeModelCallStartedEvent = Extract<
  NativeModelCallDiagnosticEvent,
  { type: "model.call.started" }
>;

type NativeModelCallEndedEvent = Extract<
  NativeModelCallDiagnosticEvent,
  { type: "model.call.completed" | "model.call.error" }
>;

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

export type NativeModelCallObservationRecord = {
  timestamp: string;
  kind: "model_identity_observed";
  observationScope: "turn";
  observationUnit: "turn";
  source: "diagnostic_model_call";
  phase: "started" | "ended";
  runId: string;
  /** OpenClaw's turn-scoped diagnostic identifier, not an upstream request ID. */
  callId: string;
  decisionId?: string;
  mode?: RouterMode;
  selectedProvider?: string;
  selectedModel?: string;
  resolvedProvider: string;
  resolvedModel: string;
  api?: string;
  transport?: string;
  durationMs?: number;
  outcome?: "completed" | "error";
  errorCategory?: string;
};

export type CorrelatedNativeModelCall = {
  runId: string;
  callId: string;
  started?: NativeModelCallObservationRecord;
  ended?: NativeModelCallObservationRecord;
};

type SelectedDecision = Pick<
  AuditRecord,
  "decisionId" | "mode" | "selectedProvider" | "selectedModel"
>;

type ActiveCall = CorrelatedModelCall & {
  selected?: SelectedDecision;
  /**
   * The only non-lifecycle backstop for an end event that was never
   * delivered. This deliberately does not move when a run receives a later
   * decision, so unrelated activity cannot keep an orphan alive forever.
   */
  startedAt: number;
};

type ActiveNativeCall = CorrelatedNativeModelCall & {
  selected?: SelectedDecision;
  startedAt: number;
};

type RunCorrelation = {
  decision?: SelectedDecision;
  calls: Map<string, ActiveCall>;
  nativeCalls: Map<string, ActiveNativeCall>;
  callEventsObserved: boolean;
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
  /**
   * Final retention bound for an outstanding call when both its end event and
   * the run lifecycle event are lost. Ordinary calls remain protected until
   * this deliberately long timeout expires.
   */
  activeCallMaxAgeMs?: number;
};

export type ResolvedModelObservationRecord = {
  timestamp: string;
  kind: "model_identity_observed";
  runId: string;
  observationScope: "run";
  source: "agent_end_context";
  decisionId?: string;
  mode?: RouterMode;
  selectedProvider?: string;
  selectedModel?: string;
  resolvedProvider: string;
  resolvedModel: string;
};

const DEFAULT_MAX_INACTIVE_RUNS = 1024;
const DEFAULT_STALE_RUN_MS = 60 * 60 * 1000;
const DEFAULT_TERMINAL_GRACE_MS = 5 * 60 * 1000;
const DEFAULT_MAX_TERMINAL_RUNS = 1024;
const DEFAULT_ACTIVE_CALL_MAX_AGE_MS = 60 * 60 * 1000;

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
  private readonly activeCallMaxAgeMs: number;
  private sequence = 0;

  constructor(options: ModelCallCorrelationRegistryOptions = {}) {
    this.now = options.now ?? Date.now;
    this.maxInactiveRuns = options.maxInactiveRuns ?? DEFAULT_MAX_INACTIVE_RUNS;
    this.staleRunMs = options.staleRunMs ?? DEFAULT_STALE_RUN_MS;
    this.terminalGraceMs = options.terminalGraceMs ?? DEFAULT_TERMINAL_GRACE_MS;
    this.maxTerminalRuns = options.maxTerminalRuns ?? DEFAULT_MAX_TERMINAL_RUNS;
    this.activeCallMaxAgeMs = options.activeCallMaxAgeMs ?? DEFAULT_ACTIVE_CALL_MAX_AGE_MS;
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
    run.callEventsObserved = true;
    const call = run.calls.get(event.callId) ?? {
      runId: event.runId,
      callId: event.callId,
      // Bind the decision at the first start event. Do not let duplicate starts
      // or later decisions change this call's routing attribution.
      selected: run.decision,
      startedAt: this.now(),
    };
    run.calls.set(event.callId, call);
    this.touch(run);

    const record = this.makeRecord(event, "model_call_started", call.selected);
    call.started ??= record;
    this.pruneInactiveRuns();
    return record;
  }

  recordCallEnded(event: ModelCallEndedEvent): ModelCallTelemetryRecord {
    const run = this.runs.get(event.runId) ?? this.getOrCreateRun(event.runId);
    const call = run?.calls.get(event.callId);
    run.callEventsObserved = true;
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

  /**
   * Records OpenClaw's trusted native-harness model diagnostic at the scope it
   * declares. Codex 2026.9.6 uses one synthetic turn callId for an app-server
   * turn; it may contain hidden provider requests, retries, or tool work.
   */
  recordNativeModelCallStarted(
    event: NativeModelCallStartedEvent,
  ): NativeModelCallObservationRecord {
    const existing = this.runs.get(event.runId);
    if (existing?.terminalAt !== undefined) {
      this.pruneInactiveRuns();
      return this.makeNativeRecord(event, "started");
    }
    const run = existing ?? this.getOrCreateRun(event.runId);
    const call = run.nativeCalls.get(event.callId) ?? {
      runId: event.runId,
      callId: event.callId,
      // Bind the decision at the first turn diagnostic. A later decision must
      // not relabel an observation already in flight.
      selected: run.decision,
      startedAt: this.now(),
    };
    run.nativeCalls.set(event.callId, call);
    this.touch(run);

    const record = this.makeNativeRecord(event, "started", call.selected);
    call.started ??= record;
    this.pruneInactiveRuns();
    return record;
  }

  recordNativeModelCallEnded(
    event: NativeModelCallEndedEvent,
  ): NativeModelCallObservationRecord {
    const run = this.runs.get(event.runId) ?? this.getOrCreateRun(event.runId);
    const call = run.nativeCalls.get(event.callId);
    // An end without a matching start is deliberately uncorrelated: a later
    // decision must not be attached to a turn whose start was not observed.
    const record = this.makeNativeRecord(event, "ended", call?.selected);
    if (call) {
      call.ended = record;
      run.nativeCalls.delete(event.callId);
      this.touch(run);
    }
    this.pruneInactiveRuns();
    return record;
  }

  callsForRun(runId: string): CorrelatedModelCall[] {
    return [...(this.runs.get(runId)?.calls.values() ?? [])].map(
      ({ selected: _selected, startedAt: _startedAt, ...call }) => call,
    );
  }

  nativeCallsForRun(runId: string): CorrelatedNativeModelCall[] {
    return [...(this.runs.get(runId)?.nativeCalls.values() ?? [])].map(
      ({ selected: _selected, startedAt: _startedAt, ...call }) => call,
    );
  }

  /**
   * Observes the resolved model context available at run end for native
   * runtimes (including Codex app-server). This is deliberately run-scoped:
   * it has no provider request/callId claim and is only a fallback when the
   * adapter emitted no embedded model_call_* events for the run. Native turn
   * diagnostics remain separately labelled and do not suppress this weaker
   * run-scoped fallback.
   */
  recordResolvedModelObservation(params: {
    runId?: string;
    provider?: string;
    model?: string;
  }): ResolvedModelObservationRecord | undefined {
    if (!params.runId || !params.provider || !params.model) return undefined;
    const run = this.runs.get(params.runId);
    if (run?.callEventsObserved) return undefined;

    return {
      timestamp: new Date(this.now()).toISOString(),
      kind: "model_identity_observed",
      runId: params.runId,
      observationScope: "run",
      source: "agent_end_context",
      decisionId: run?.decision?.decisionId,
      mode: run?.decision?.mode,
      selectedProvider: run?.decision?.selectedProvider,
      selectedModel: run?.decision?.selectedModel,
      resolvedProvider: params.provider,
      resolvedModel: params.model,
    };
  }

  /**
   * Marks a run terminal when OpenClaw authoritatively ends it. Active calls
   * are deliberately retained during the terminal grace period: their queued
   * end events still need the snapshot captured at start. Once that finite
   * period expires, even a missing end event cannot retain the run forever.
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
      nativeCalls: new Map(),
      callEventsObserved: false,
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
      if (run.terminalAt !== undefined) {
        if (now - run.terminalAt >= this.terminalGraceMs) {
          this.runs.delete(runId);
        } else if (run.calls.size === 0 && run.nativeCalls.size === 0) {
          // Capacity applies only to drained terminal markers. A terminal run
          // with a queued end still needs its call snapshot for the full
          // grace period; it is nevertheless time-bounded above.
          terminal.push(entry);
        }
        continue;
      }
      this.pruneExpiredCalls(run, now);
      if (run.calls.size > 0 || run.nativeCalls.size > 0) continue;
      if (now - run.lastTouched >= this.staleRunMs) {
        this.runs.delete(runId);
      } else {
        inactive.push(entry);
      }
    }

    this.pruneByCapacity(terminal, this.maxTerminalRuns);
    this.pruneByCapacity(inactive, this.maxInactiveRuns);
  }

  private pruneExpiredCalls(run: RunCorrelation, now: number): void {
    for (const [callId, call] of run.calls) {
      if (now - call.startedAt >= this.activeCallMaxAgeMs) {
        run.calls.delete(callId);
      }
    }
    for (const [callId, call] of run.nativeCalls) {
      if (now - call.startedAt >= this.activeCallMaxAgeMs) {
        run.nativeCalls.delete(callId);
      }
    }
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

  private makeNativeRecord(
    event: NativeModelCallDiagnosticEvent,
    phase: NativeModelCallObservationRecord["phase"],
    selected?: SelectedDecision,
  ): NativeModelCallObservationRecord {
    return {
      timestamp: new Date(this.now()).toISOString(),
      kind: "model_identity_observed",
      observationScope: "turn",
      observationUnit: "turn",
      source: "diagnostic_model_call",
      phase,
      runId: event.runId,
      callId: event.callId,
      decisionId: selected?.decisionId,
      mode: selected?.mode,
      selectedProvider: selected?.selectedProvider,
      selectedModel: selected?.selectedModel,
      resolvedProvider: event.provider,
      resolvedModel: event.model,
      api: event.api,
      transport: event.transport,
      durationMs: event.type === "model.call.started" ? undefined : event.durationMs,
      outcome: event.type === "model.call.completed"
        ? "completed"
        : event.type === "model.call.error"
          ? "error"
          : undefined,
      errorCategory: event.type === "model.call.error" ? event.errorCategory : undefined,
    };
  }
}
