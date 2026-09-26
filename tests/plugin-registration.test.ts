import { describe, expect, it, vi } from "vitest";
import plugin from "../src/index.js";

type InternalHookOptions = {
  name?: string;
  description?: string;
};

describe("plugin registration contract", () => {
  it("registers the internal session patch hook and typed telemetry observers", () => {
    const registerHook = vi.fn(
      (
        events: string | string[],
        _handler: (event: unknown) => unknown,
        opts?: InternalHookOptions,
      ) => {
        if (!opts?.name?.trim()) {
          throw new Error("hook registration missing name");
        }

        return { events, opts };
      },
    );

    const on = vi.fn();

    const api = {
      pluginConfig: { mode: "shadow" },
      registerHook,
      on,
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      },
    };

    expect(() => plugin.register(api as never)).not.toThrow();

    expect(registerHook).toHaveBeenCalledTimes(1);
    expect(registerHook).toHaveBeenCalledWith(
      "session:patch",
      expect.any(Function),
      expect.objectContaining({
        name: "deterministic-router-session-patch",
        description: expect.any(String),
      }),
    );

    const options = registerHook.mock.calls[0]?.[2];
    expect(options?.name?.trim()).toBe("deterministic-router-session-patch");

    expect(on).toHaveBeenCalledWith("before_model_resolve", expect.any(Function));
    expect(on).toHaveBeenCalledWith("model_call_started", expect.any(Function));
    expect(on).toHaveBeenCalledWith("model_call_ended", expect.any(Function));
    expect(on).toHaveBeenCalledWith("agent_end", expect.any(Function));
  });

  it("records selected-only telemetry without applying an override in shadow mode", () => {
    const registerHook = vi.fn();
    const on = vi.fn();
    const info = vi.fn();
    const api = {
      pluginConfig: { mode: "shadow" },
      registerHook,
      on,
      logger: {
        info,
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      },
    };

    plugin.register(api as never);

    const beforeModelResolve = on.mock.calls.find(
      ([eventName]) => eventName === "before_model_resolve",
    )?.[1] as (
      event: { prompt: string },
      context: { sessionKey: string; runId: string; agentId: string },
    ) => unknown;

    expect(beforeModelResolve).toBeDefined();
    expect(beforeModelResolve(
      { prompt: "Summarize this short note." },
      { sessionKey: "shadow-session", runId: "shadow-run", agentId: "agent" },
    )).toBeUndefined();

    const auditMessage = info.mock.calls
      .map(([message]) => message)
      .find((message): message is string =>
        typeof message === "string"
        && message.includes('"verificationLevel":"selected-only"'),
      );
    expect(auditMessage).toBeDefined();
    expect(JSON.parse(auditMessage!.slice("[deterministic-router] ".length))).toMatchObject({
      runId: "shadow-run",
      mode: "shadow",
      verificationLevel: "selected-only",
      applied: false,
    });
  });
});
