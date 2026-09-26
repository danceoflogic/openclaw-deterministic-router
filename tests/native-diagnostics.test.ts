import {
  emitDiagnosticEvent,
  emitTrustedDiagnosticEvent,
  waitForDiagnosticEventsDrained,
} from "openclaw/plugin-sdk/diagnostic-runtime";
import { afterEach, describe, expect, it } from "vitest";
import { onNativeModelCallDiagnostic } from "../src/native-diagnostics.js";

describe("native model-call diagnostic bridge", () => {
  let unsubscribe: (() => void) | undefined;

  afterEach(async () => {
    unsubscribe?.();
    unsubscribe = undefined;
    await waitForDiagnosticEventsDrained();
  });

  it("forwards trusted turn diagnostics but rejects request and untrusted events", async () => {
    const received: Array<{ type: string; callId: string }> = [];
    unsubscribe = onNativeModelCallDiagnostic((event) => {
      received.push({ type: event.type, callId: event.callId });
    });

    emitTrustedDiagnosticEvent({
      type: "model.call.started",
      runId: "run-turn",
      callId: "run-turn:codex-model:1",
      provider: "openai",
      model: "resolved-model",
      observationUnit: "turn",
    });
    emitTrustedDiagnosticEvent({
      type: "model.call.started",
      runId: "run-request",
      callId: "request-1",
      provider: "openai",
      model: "resolved-model",
      observationUnit: "request",
    });
    emitDiagnosticEvent({
      type: "model.call.started",
      runId: "run-untrusted",
      callId: "untrusted-1",
      provider: "openai",
      model: "resolved-model",
      observationUnit: "turn",
    });

    await waitForDiagnosticEventsDrained();

    expect(received).toEqual([{
      type: "model.call.started",
      callId: "run-turn:codex-model:1",
    }]);
  });
});
