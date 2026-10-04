import { describe, expect, it } from "vitest";
import {
  applySessionPatch,
  reconcilePersistedSessionEntry,
  SessionLockRegistry,
} from "../src/session-lock.js";

describe("session model-selection lock registry", () => {
  it("records a persisted model selection from post-operation session state", () => {
    const registry = new SessionLockRegistry();
    expect(
      applySessionPatch(
        registry,
        "s1",
        { key: "s1", model: "openai/gpt-5.6-sol" },
        { sessionId: "session-1", providerOverride: "openai", modelOverride: "gpt-5.6-sol" },
      ),
    ).toBe("set");
    expect(registry.get("s1")).toMatchObject({
      provider: "openai",
      model: "gpt-5.6-sol",
      sessionId: "session-1",
    });
  });

  it("reconciles a pre-existing persisted selection after a fresh registry starts", () => {
    const registry = new SessionLockRegistry();

    expect(
      reconcilePersistedSessionEntry(registry, "s1", {
        sessionId: "session-1",
        providerOverride: "openai",
        modelOverride: "gpt-5.6-sol",
        model: "MiniMaxAI/MiniMax-M3-MXFP8",
        modelProvider: "telnyx",
      }),
    ).toBe("set");
    expect(registry.getState("s1")).toBe("locked");
    expect(registry.get("s1")).toMatchObject({
      provider: "openai",
      model: "gpt-5.6-sol",
      sessionId: "session-1",
    });
  });

  it("clears the lock when a model-selection patch normalizes back to default", () => {
    const registry = new SessionLockRegistry();
    registry.set("s1", { model: "gpt-5.6-sol", provider: "openai" });

    expect(
      applySessionPatch(
        registry,
        "s1",
        { key: "s1", model: "default" },
        { sessionId: "abc" },
      ),
    ).toBe("cleared");
    expect(registry.get("s1")).toBeUndefined();
    expect(registry.getState("s1")).toBe("clear");
  });

  it("treats the persisted default source as a clear even if legacy override fields remain", () => {
    const registry = new SessionLockRegistry();
    registry.set("s1", { model: "gpt-5.6-sol", provider: "openai" });

    expect(
      reconcilePersistedSessionEntry(registry, "s1", {
        sessionId: "session-2",
        modelOverrideSource: "default",
        providerOverride: "openai",
        modelOverride: "gpt-5.6-sol",
      }),
    ).toBe("cleared");
    expect(registry.get("s1")).toBeUndefined();
    expect(registry.getState("s1")).toBe("clear");
  });

  it("removes stale state and fails closed when persisted state is missing or ambiguous", () => {
    const registry = new SessionLockRegistry();
    registry.set("s1", { model: "gpt-5.6-sol", provider: "openai" });

    expect(reconcilePersistedSessionEntry(registry, "s1", undefined)).toBe("unknown");
    expect(registry.get("s1")).toBeUndefined();
    expect(registry.getState("s1")).toBe("unknown");

    expect(
      reconcilePersistedSessionEntry(registry, "s1", {
        sessionId: "session-3",
        modelOverrideSource: "user",
      }),
    ).toBe("unknown");
    expect(registry.getState("s1")).toBe("unknown");
  });

  it("keeps reset/recreated sessions isolated from another session's lock", () => {
    const registry = new SessionLockRegistry();
    reconcilePersistedSessionEntry(registry, "s1", {
      sessionId: "session-1",
      providerOverride: "openai",
      modelOverride: "gpt-5.6-sol",
    });
    reconcilePersistedSessionEntry(registry, "s2", {
      sessionId: "session-2",
      providerOverride: "openai",
      modelOverride: "gpt-5.6-luna",
    });

    expect(reconcilePersistedSessionEntry(registry, "s1", { sessionId: "session-4" })).toBe("cleared");
    expect(registry.getState("s1")).toBe("clear");
    expect(registry.get("s2")).toMatchObject({ model: "gpt-5.6-luna" });
  });

  it("ignores unrelated session patches", () => {
    const registry = new SessionLockRegistry();
    expect(
      applySessionPatch(registry, "s1", { key: "s1", thinking: "medium" }, { sessionId: "abc" }),
    ).toBe("ignored");
    expect(registry.get("s1")).toBeUndefined();
  });

  it("supports patch-only runtimes as a conservative compatibility fallback", () => {
    const registry = new SessionLockRegistry();
    expect(
      applySessionPatch(registry, "s1", {
        modelOverride: "gpt-5.6-sol",
        providerOverride: "openai",
      }),
    ).toBe("set");
    expect(registry.get("s1")?.model).toBe("gpt-5.6-sol");
  });

  it("clears a patch-only default sentinel", () => {
    const registry = new SessionLockRegistry();
    registry.set("s1", { model: "gpt-5.6-sol", provider: "openai" });

    expect(applySessionPatch(registry, "s1", { model: "default" })).toBe("cleared");
    expect(registry.get("s1")).toBeUndefined();
  });
});
