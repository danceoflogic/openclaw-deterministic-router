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
    expect(on).toHaveBeenCalledWith("reply_dispatch", expect.any(Function));
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
      attachmentCount: 0,
      attachmentKinds: [],
    });
  });

  it.each(["image", "document"] as const)(
    "applies the attachment floor for supplied %s metadata without logging attachment content",
    (kind) => {
      const on = vi.fn();
      const info = vi.fn();
      const runId = `attachment-${kind}-run`;
      const api = {
        pluginConfig: { mode: "shadow" },
        registerHook: vi.fn(),
        on,
        runtime: {
          agent: { session: { getSessionEntry: vi.fn(() => ({ sessionId: `${kind}-session` })) } },
        },
        logger: { info, warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
      };

      plugin.register(api as never);

      const beforeModelResolve = on.mock.calls.find(
        ([eventName]) => eventName === "before_model_resolve",
      )?.[1] as (
        event: { prompt: string; attachments?: unknown[] },
        context: { sessionKey: string; runId: string; agentId: string },
      ) => unknown;

      beforeModelResolve(
        {
          prompt: "Hello",
          attachments: [{
            kind,
            mimeType: kind === "image" ? "image/png" : "text/plain",
            fileName: "private-fixture-name.txt",
            content: "PRIVATE_ATTACHMENT_SENTINEL",
          }],
        },
        { sessionKey: `${kind}-session`, runId, agentId: "agent" },
      );

      const auditMessage = info.mock.calls
        .map(([message]) => message)
        .find((message): message is string =>
          typeof message === "string" && message.includes(`"runId":"${runId}"`),
        );
      expect(auditMessage).toBeDefined();
      const audit = JSON.parse(auditMessage!.slice("[deterministic-router] ".length));
      expect(audit).toMatchObject({
        classifierTier: "SIMPLE",
        effectiveTier: "MEDIUM",
        attachmentCount: 1,
        attachmentKinds: [kind],
        reason: "classifier=SIMPLE; attachment floor promoted to MEDIUM",
      });
      expect(auditMessage).not.toContain("image/png");
      expect(auditMessage).not.toContain("text/plain");
      expect(auditMessage).not.toContain("private-fixture-name.txt");
      expect(auditMessage).not.toContain("PRIVATE_ATTACHMENT_SENTINEL");
    },
  );

  it.each([
    ["Hello", "SIMPLE", "MEDIUM"],
    ["Prove this theorem formally, step by step, and derive the result.", "REASONING", "REASONING"],
  ] as const)(
    "uses a real inbound document fact and original %s text without leaking content",
    (prompt, classifierTier, effectiveTier) => {
      const on = vi.fn();
      const info = vi.fn();
      const api = {
        pluginConfig: { mode: "shadow" },
        registerHook: vi.fn(),
        on,
        runtime: {
          agent: { session: { getSessionEntry: vi.fn(() => ({ sessionId: "doc-session" })) } },
        },
        logger: { info, warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
      };
      plugin.register(api as never);
      const replyDispatch = on.mock.calls.find(([name]) => name === "reply_dispatch")?.[1] as
        (event: unknown) => unknown;
      const beforeModelResolve = on.mock.calls.find(([name]) => name === "before_model_resolve")?.[1] as
        (event: { prompt: string; attachments?: unknown[] }, ctx: {
          sessionKey: string; runId: string; agentId: string;
        }) => unknown;

      expect(replyDispatch({
        runId: "doc-run",
        sessionKey: "doc-session",
        ctx: {
          BodyForCommands: prompt,
          media: [{
            contentType: "text/plain",
            path: "/private/fixture.txt",
            fileName: "private-fixture-name.txt",
            content: "PRIVATE_ATTACHMENT_SENTINEL",
          }],
        },
      })).toBeUndefined();
      expect(beforeModelResolve(
        { prompt: `${prompt}\n[media attached: private-ref]\nPRIVATE_ATTACHMENT_SENTINEL` },
        { sessionKey: "doc-session", runId: "doc-run", agentId: "agent" },
      )).toBeUndefined();

      const message = info.mock.calls.map(([value]) => value).find(
        (value): value is string => typeof value === "string" && value.includes('"runId":"doc-run"'),
      );
      expect(message).toBeDefined();
      expect(JSON.parse(message!.slice("[deterministic-router] ".length))).toMatchObject({
        classifierTier,
        effectiveTier,
        attachmentCount: 1,
        attachmentKinds: ["document"],
        applied: false,
      });
      expect(message).not.toContain("private-fixture-name.txt");
      expect(message).not.toContain("/private/fixture.txt");
      expect(message).not.toContain("PRIVATE_ATTACHMENT_SENTINEL");
      expect(message).not.toContain("text/plain");
    },
  );

  it("reads the WebChat document session key from the finalized message context", () => {
    const on = vi.fn();
    const info = vi.fn();
    plugin.register({
      pluginConfig: { mode: "shadow" },
      registerHook: vi.fn(),
      on,
      runtime: { agent: { session: { getSessionEntry: vi.fn(() => ({ sessionId: "webchat-session" })) } } },
      logger: { info, warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    } as never);
    const replyDispatch = on.mock.calls.find(([name]) => name === "reply_dispatch")?.[1] as
      (event: unknown) => unknown;
    const beforeModelResolve = on.mock.calls.find(([name]) => name === "before_model_resolve")?.[1] as
      (event: { prompt: string }, ctx: { sessionKey: string; runId: string; agentId: string }) => unknown;

    replyDispatch({
      runId: "webchat-document-run",
      ctx: { SessionKey: "webchat-session", BodyForCommands: "Hello", media: [{ contentType: "text/plain" }] },
    });
    beforeModelResolve(
      { prompt: "Hello\n[media attached: private-ref]" },
      { sessionKey: "webchat-session", runId: "webchat-document-run", agentId: "agent" },
    );

    const message = info.mock.calls.map(([value]) => value).find(
      (value): value is string => typeof value === "string" && value.includes('"runId":"webchat-document-run"'),
    );
    expect(message).toBeDefined();
    expect(JSON.parse(message!.slice("[deterministic-router] ".length))).toMatchObject({
      classifierTier: "SIMPLE",
      effectiveTier: "MEDIUM",
      attachmentCount: 1,
      attachmentKinds: ["document"],
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
