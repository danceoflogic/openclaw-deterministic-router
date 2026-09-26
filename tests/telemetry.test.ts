import { describe, expect, it } from "vitest";
import { DEFAULT_PLUGIN_CONFIG } from "../src/config.js";
import { routeWork } from "../src/route-work.js";
import {
  makeAuditRecord,
  ModelCallCorrelationRegistry,
  type AuditRecord,
} from "../src/telemetry.js";

function auditFor(runId: string, decisionId: string, provider: string, model: string): AuditRecord {
  return {
    timestamp: "2026-09-25T00:00:00.000Z",
    decisionId,
    runId,
    mode: "auto",
    classifierTier: "SIMPLE",
    effectiveTier: "SIMPLE",
    score: 0,
    confidence: 1,
    selectedProvider: provider,
    selectedModel: model,
    manualLock: false,
    applied: true,
    reason: "test decision",
  };
}

describe("model-call telemetry correlation", () => {
  it("keeps selected and effective targets separate while calls are active", () => {
    const registry = new ModelCallCorrelationRegistry();
    const decision = routeWork(
      { prompt: "Prove this theorem formally, step by step, and derive the result." },
      DEFAULT_PLUGIN_CONFIG,
    );
    const audit = makeAuditRecord({
      decision,
      mode: "auto",
      runId: "run-1",
      manualLock: false,
      applied: true,
    });
    registry.recordDecision(audit);

    const firstStarted = registry.recordCallStarted({
      runId: "run-1",
      callId: "call-1",
      provider: "openai",
      model: "gpt-5.6-sol",
      api: "responses",
    });
    const firstEnded = registry.recordCallEnded({
      runId: "run-1",
      callId: "call-1",
      provider: "openai",
      model: "gpt-5.6-sol",
      durationMs: 120,
      outcome: "completed",
    });
    const retryStarted = registry.recordCallStarted({
      runId: "run-1",
      callId: "call-2",
      provider: "fallback-provider",
      model: "fallback-model",
    });

    expect(firstStarted.selectedProvider).toBe(decision.target.provider);
    expect(firstStarted.selectedModel).toBe(decision.target.model);
    expect(firstStarted.effectiveProvider).toBe("openai");
    expect(firstStarted.effectiveModel).toBe("gpt-5.6-sol");
    expect(firstEnded.decisionId).toBe(firstStarted.decisionId);
    expect(firstEnded.durationMs).toBe(120);
    expect(retryStarted.effectiveProvider).toBe("fallback-provider");
    expect(registry.callsForRun("run-1")).toEqual([
      { runId: "run-1", callId: "call-2", started: retryStarted },
    ]);
  });

  it("binds each call to the decision that existed when that call started", () => {
    const registry = new ModelCallCorrelationRegistry();
    registry.recordDecision(auditFor("run-1", "decision-a", "provider-a", "model-a"));

    const callOneStarted = registry.recordCallStarted({
      runId: "run-1",
      callId: "call-1",
      provider: "effective-a",
      model: "effective-model-a",
    });

    registry.recordDecision(auditFor("run-1", "decision-b", "provider-b", "model-b"));
    const callTwoStarted = registry.recordCallStarted({
      runId: "run-1",
      callId: "call-2",
      provider: "effective-b",
      model: "effective-model-b",
    });
    const callOneEnded = registry.recordCallEnded({
      runId: "run-1",
      callId: "call-1",
      provider: "effective-a",
      model: "effective-model-a",
      durationMs: 1,
      outcome: "completed",
    });
    const callTwoEnded = registry.recordCallEnded({
      runId: "run-1",
      callId: "call-2",
      provider: "effective-b",
      model: "effective-model-b",
      durationMs: 2,
      outcome: "completed",
    });

    expect(callOneStarted).toMatchObject({
      decisionId: "decision-a",
      selectedProvider: "provider-a",
      selectedModel: "model-a",
    });
    expect(callOneEnded).toMatchObject({
      decisionId: "decision-a",
      selectedProvider: "provider-a",
      selectedModel: "model-a",
    });
    expect(callTwoStarted).toMatchObject({
      decisionId: "decision-b",
      selectedProvider: "provider-b",
      selectedModel: "model-b",
    });
    expect(callTwoEnded).toMatchObject({
      decisionId: "decision-b",
      selectedProvider: "provider-b",
      selectedModel: "model-b",
    });
    expect(registry.callsForRun("run-1")).toEqual([]);
  });

  it("evicts stale inactive runs without evicting an active call", () => {
    let clock = 0;
    const registry = new ModelCallCorrelationRegistry({
      now: () => clock,
      staleRunMs: 100,
      maxInactiveRuns: 2,
    });
    registry.recordDecision(auditFor("inactive", "inactive-decision", "p", "m"));
    registry.recordDecision(auditFor("active", "active-decision", "active-p", "active-m"));
    registry.recordCallStarted({
      runId: "active",
      callId: "active-call",
      provider: "effective-p",
      model: "effective-m",
    });

    clock = 100;
    registry.recordDecision(auditFor("trigger", "trigger-decision", "p", "m"));

    const activeEnded = registry.recordCallEnded({
      runId: "active",
      callId: "active-call",
      provider: "effective-p",
      model: "effective-m",
      durationMs: 10,
      outcome: "completed",
    });
    const inactiveRestarted = registry.recordCallStarted({
      runId: "inactive",
      callId: "after-eviction",
      provider: "effective-p",
      model: "effective-m",
    });

    expect(activeEnded.decisionId).toBe("active-decision");
    expect(inactiveRestarted.decisionId).toBeUndefined();

    registry.recordCallEnded({
      runId: "inactive",
      callId: "after-eviction",
      provider: "effective-p",
      model: "effective-m",
      durationMs: 1,
      outcome: "completed",
    });
    clock = 200;
    registry.recordDecision(auditFor("later-trigger", "later-decision", "p", "m"));
    const activeRestarted = registry.recordCallStarted({
      runId: "active",
      callId: "after-completion-eviction",
      provider: "effective-p",
      model: "effective-m",
    });
    expect(activeRestarted.decisionId).toBeUndefined();
  });

  it("retains active snapshots through terminal grace so a delayed end remains correlated", () => {
    let clock = 0;
    const registry = new ModelCallCorrelationRegistry({
      now: () => clock,
      terminalGraceMs: 100,
      maxTerminalRuns: 2,
    });
    registry.recordDecision(auditFor("run-1", "decision-a", "provider-a", "model-a"));
    const started = registry.recordCallStarted({
      runId: "run-1",
      callId: "call-1",
      provider: "effective-a",
      model: "effective-model-a",
    });

    // OpenClaw can publish agent_end before its queued model-call end event.
    registry.completeRun("run-1");
    clock = 99;
    registry.recordDecision(auditFor("cleanup-trigger", "trigger", "p", "m"));
    const ended = registry.recordCallEnded({
      runId: "run-1",
      callId: "call-1",
      provider: "effective-a",
      model: "effective-model-a",
      durationMs: 1,
      outcome: "completed",
    });
    const lateStarted = registry.recordCallStarted({
      runId: "run-1",
      callId: "late-call",
      provider: "effective-a",
      model: "effective-model-a",
    });

    expect(started.decisionId).toBe("decision-a");
    expect(ended.decisionId).toBe("decision-a");
    expect(ended.selectedProvider).toBe("provider-a");
    expect(registry.callsForRun("run-1")).toEqual([]);
    expect(lateStarted.decisionId).toBeUndefined();

    clock = 100;
    registry.recordDecision(auditFor("after-grace-trigger", "trigger", "p", "m"));
    const afterEviction = registry.recordCallStarted({
      runId: "run-1",
      callId: "after-eviction",
      provider: "effective-a",
      model: "effective-model-a",
    });
    expect(afterEviction.decisionId).toBeUndefined();
    expect(registry.callsForRun("run-1")).toEqual([
      { runId: "run-1", callId: "after-eviction", started: afterEviction },
    ]);
  });

  it("evicts a terminal run with an orphaned call after terminal grace", () => {
    let clock = 0;
    const registry = new ModelCallCorrelationRegistry({
      now: () => clock,
      terminalGraceMs: 100,
      // Capacity must not evict a terminal run with a queued end before grace.
      maxTerminalRuns: 0,
    });
    registry.recordDecision(auditFor("orphaned-terminal", "decision-a", "provider-a", "model-a"));
    const started = registry.recordCallStarted({
      runId: "orphaned-terminal",
      callId: "lost-end",
      provider: "effective-a",
      model: "effective-model-a",
    });
    registry.completeRun("orphaned-terminal");

    clock = 99;
    registry.recordDecision(auditFor("before-grace", "trigger", "p", "m"));
    expect(registry.callsForRun("orphaned-terminal")).toEqual([
      { runId: "orphaned-terminal", callId: "lost-end", started },
    ]);

    clock = 100;
    registry.recordDecision(auditFor("after-grace", "trigger", "p", "m"));
    expect(registry.callsForRun("orphaned-terminal")).toEqual([]);
    const lateStarted = registry.recordCallStarted({
      runId: "orphaned-terminal",
      callId: "after-eviction",
      provider: "effective-a",
      model: "effective-model-a",
    });
    expect(lateStarted.decisionId).toBeUndefined();
  });

  it("expires a non-terminal orphaned call and its stale run after the explicit backstop", () => {
    let clock = 0;
    const registry = new ModelCallCorrelationRegistry({
      now: () => clock,
      activeCallMaxAgeMs: 100,
      staleRunMs: 100,
    });
    registry.recordDecision(auditFor("orphaned-active", "decision-a", "provider-a", "model-a"));
    registry.recordCallStarted({
      runId: "orphaned-active",
      callId: "lost-end-and-lifecycle",
      provider: "effective-a",
      model: "effective-model-a",
    });

    clock = 100;
    registry.recordDecision(auditFor("cleanup-trigger", "trigger", "p", "m"));

    expect(registry.callsForRun("orphaned-active")).toEqual([]);
    const afterEviction = registry.recordCallStarted({
      runId: "orphaned-active",
      callId: "after-eviction",
      provider: "effective-a",
      model: "effective-model-a",
    });
    expect(afterEviction.decisionId).toBeUndefined();
  });

  it("records a run-scoped resolved model from native runtime context", () => {
    const registry = new ModelCallCorrelationRegistry();
    registry.recordDecision(auditFor("codex-run", "decision-codex", "openai", "configured-model"));

    expect(registry.recordResolvedModelObservation({
      runId: "codex-run",
      provider: "openai",
      model: "resolved-codex-model",
    })).toMatchObject({
      kind: "model_identity_observed",
      observationScope: "run",
      source: "agent_end_context",
      runId: "codex-run",
      decisionId: "decision-codex",
      selectedProvider: "openai",
      selectedModel: "configured-model",
      resolvedProvider: "openai",
      resolvedModel: "resolved-codex-model",
    });
  });

  it("does not duplicate embedded call telemetry with a run-scoped observation", () => {
    const registry = new ModelCallCorrelationRegistry();
    registry.recordDecision(auditFor("embedded-run", "decision-embedded", "p", "m"));
    registry.recordCallStarted({
      runId: "embedded-run",
      callId: "call-1",
      provider: "p",
      model: "m",
    });

    expect(registry.recordResolvedModelObservation({
      runId: "embedded-run",
      provider: "p",
      model: "m",
    })).toBeUndefined();
  });
});
