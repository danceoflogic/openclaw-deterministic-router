import { describe, expect, it } from "vitest";
import { applySessionPatch, SessionLockRegistry } from "../src/session-lock.js";

describe("session model-selection lock registry", () => {
  it("records a persisted model selection from post-operation session state", () => {
    const registry = new SessionLockRegistry();
    expect(
      applySessionPatch(
        registry,
        "s1",
        { key: "s1", model: "openai/gpt-5.6-sol" },
        { providerOverride: "openai", modelOverride: "gpt-5.6-sol" },
      ),
    ).toBe("set");
    expect(registry.get("s1")).toMatchObject({
      provider: "openai",
      model: "gpt-5.6-sol",
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
});
