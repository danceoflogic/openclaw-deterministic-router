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
      runtime: {
        agent: {
          session: {
            getSessionEntry: vi.fn(() => ({ sessionId: "registration-session" })),
          },
        },
      },
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
      runtime: {
        agent: {
          session: {
            getSessionEntry: vi.fn(() => ({ sessionId: "shadow-session" })),
          },
        },
      },
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

  it("reconciles persisted model selection before AUTO and isolates sessions", () => {
    const registerHook = vi.fn();
    const on = vi.fn();
    const info = vi.fn();
    const entries: Record<string, unknown> = {
      locked: {
        sessionId: "locked-session",
        providerOverride: "openai",
        modelOverride: "gpt-5.6-sol",
      },
      automatic: { sessionId: "automatic-session" },
    };
    const getSessionEntry = vi.fn(({ sessionKey }: { sessionKey: string }) => entries[sessionKey]);
    const api = {
      pluginConfig: { mode: "auto" },
      registerHook,
      on,
      runtime: {
        agent: {
          session: { getSessionEntry },
        },
      },
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

    expect(beforeModelResolve(
      { prompt: "Analyze the concurrent failure modes in this implementation." },
      { sessionKey: "locked", runId: "locked-run", agentId: "agent" },
    )).toBeUndefined();
    expect(beforeModelResolve(
      { prompt: "Summarize this short note." },
      { sessionKey: "automatic", runId: "automatic-run", agentId: "agent" },
    )).toMatchObject({
      providerOverride: expect.any(String),
      modelOverride: expect.any(String),
    });
    expect(getSessionEntry).toHaveBeenNthCalledWith(1, {
      agentId: "agent",
      readConsistency: "latest",
      sessionKey: "locked",
    });

    const audits = info.mock.calls
      .map(([message]) => typeof message === "string" ? message : undefined)
      .filter((message): message is string =>
        message !== undefined && message.includes('"verificationLevel":"selected-only"'),
      )
      .map((message) => JSON.parse(message.slice("[deterministic-router] ".length)));
    expect(audits).toEqual(expect.arrayContaining([
      expect.objectContaining({
        runId: "locked-run",
        manualLock: true,
        applied: false,
        reason: "manual session model selection detected; router yielded",
      }),
      expect.objectContaining({
        runId: "automatic-run",
        manualLock: false,
        applied: true,
      }),
    ]));
  });

  it("fails closed and drops a stale lock when the authoritative session entry disappears", () => {
    const registerHook = vi.fn();
    const on = vi.fn();
    const info = vi.fn();
    let entry: unknown = {
      sessionId: "session-before-delete",
      providerOverride: "openai",
      modelOverride: "gpt-5.6-sol",
    };
    const api = {
      pluginConfig: { mode: "auto" },
      registerHook,
      on,
      runtime: {
        agent: {
          session: {
            getSessionEntry: vi.fn(() => entry),
          },
        },
      },
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
    const context = { sessionKey: "reused", runId: "run-1", agentId: "agent" };

    expect(beforeModelResolve({ prompt: "Summarize this short note." }, context)).toBeUndefined();
    entry = undefined;
    expect(beforeModelResolve({ prompt: "Summarize this short note." }, {
      ...context,
      runId: "run-2",
    })).toBeUndefined();

    const audit = info.mock.calls
      .map(([message]) => typeof message === "string" ? message : undefined)
      .filter((message): message is string =>
        message !== undefined && message.includes('"runId":"run-2"'),
      )
      .map((message) => JSON.parse(message.slice("[deterministic-router] ".length)))[0];
    expect(audit).toMatchObject({
      manualLock: false,
      applied: false,
      reason: "persisted session model selection unavailable; fail-closed without override",
    });
  });

  it("fails closed for a missing session identity while manual protection is enabled", () => {
    const registerHook = vi.fn();
    const on = vi.fn();
    const info = vi.fn();
    const api = {
      pluginConfig: { mode: "auto", requireSessionKeyForAuto: false },
      registerHook,
      on,
      runtime: {
        agent: {
          session: { getSessionEntry: vi.fn() },
        },
      },
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
      context: { sessionKey?: string; runId: string; agentId: string },
    ) => unknown;

    expect(beforeModelResolve(
      { prompt: "Summarize this short note." },
      { runId: "missing-session-run", agentId: "agent" },
    )).toBeUndefined();
    expect(api.runtime.agent.session.getSessionEntry).not.toHaveBeenCalled();

    const audit = info.mock.calls
      .map(([message]) => typeof message === "string" ? message : undefined)
      .find((message): message is string =>
        message !== undefined && message.includes('"runId":"missing-session-run"'),
      );
    expect(audit).toBeDefined();
    expect(JSON.parse(audit!.slice("[deterministic-router] ".length))).toMatchObject({
      applied: false,
      reason: "persisted session model selection unavailable; fail-closed without override",
    });
  });
});
