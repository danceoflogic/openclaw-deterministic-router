import { describe, expect, it } from "vitest";
import { DEFAULT_PLUGIN_CONFIG } from "../src/config.js";
import { routeWork } from "../src/route-work.js";
import { makeAuditRecord, ModelCallCorrelationRegistry } from "../src/telemetry.js";

describe("model-call telemetry correlation", () => {
  it("keeps selected and effective targets separate for multiple calls in one run", () => {
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
    expect(firstEnded.durationMs).toBe(120);
    expect(retryStarted.effectiveProvider).toBe("fallback-provider");
    expect(registry.callsForRun("run-1")).toEqual([
      { runId: "run-1", callId: "call-1", started: firstStarted, ended: firstEnded },
      { runId: "run-1", callId: "call-2", started: retryStarted },
    ]);
  });
});
