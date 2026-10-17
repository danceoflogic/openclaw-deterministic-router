import { createHash, randomUUID } from "node:crypto";
import {
  emitTrustedDiagnosticEvent,
  waitForDiagnosticEventsDrained,
} from "openclaw/plugin-sdk/diagnostic-runtime";
import { afterEach, describe, expect, it, vi } from "vitest";
import { pathToFileURL } from "node:url";
import plugin from "../src/index.js";

type InternalHookOptions = {
  name?: string;
  description?: string;
};

describe("plugin registration contract", () => {
  const disposals: Array<() => void> = [];

  afterEach(async () => {
    for (const dispose of disposals.splice(0)) dispose();
    await waitForDiagnosticEventsDrained();
  });

  function managedRegistration() {
    const cleanups: Array<() => void> = [];
    const onDispose = vi.fn((cleanup: () => void) => {
      cleanups.push(cleanup);
      return () => {};
    });
    const on = vi.fn();
    const info = vi.fn();
    const api = {
      pluginConfig: { mode: "shadow" },
      lifecycle: { onDispose },
      registerHook: vi.fn(),
      on,
      runtime: { agent: { session: { getSessionEntry: vi.fn(() => ({ sessionId: "native-session" })) } } },
      logger: { info, warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    };
    plugin.register(api as never);
    const dispose = () => { for (const cleanup of cleanups) cleanup(); };
    disposals.push(dispose);
    const resolve = on.mock.calls.find(([name]) => name === "before_model_resolve")?.[1] as
      (event: { prompt: string }, ctx: { sessionKey: string; runId: string; agentId: string }) => unknown;
    const observe = (runId: string) => {
      resolve({ prompt: "Hello" }, { sessionKey: "native-session", runId, agentId: "agent" });
      emitNativePair(runId);
    };
    const observations = () => info.mock.calls.map(([message]) =>
      JSON.parse(String(message).slice("[deterministic-router] ".length)),
    ).filter((record) => record.source === "diagnostic_model_call");
    return { onDispose, info, dispose, observe, observations };
  }

  function emitNativePair(runId: string) {
    const identity = {
      runId,
      callId: `${runId}:codex-model:1`,
      provider: "openai",
      model: "gpt-6-sol",
      observationUnit: "turn" as const,
    };
    emitTrustedDiagnosticEvent({ type: "model.call.started", ...identity });
    emitTrustedDiagnosticEvent({ type: "model.call.completed", ...identity, durationMs: 1 });
  }

  it("registers a managed native listener and correlates exactly one start/end pair", async () => {
    const instance = managedRegistration();
    expect(instance.onDispose).toHaveBeenCalledTimes(1);
    instance.observe("managed-run");
    await waitForDiagnosticEventsDrained();
    const records = instance.observations();
    expect(records).toHaveLength(2);
    expect(records.map((record) => record.phase)).toEqual(["started", "ended"]);
    for (const record of records) {
      expect(record).toMatchObject({ runId: "managed-run", verificationLevel: "runtime-model", resolvedModel: "gpt-6-sol" });
      expect(record.decisionId).toEqual(expect.any(String));
    }
    expect(records[0].decisionId).toBe(records[1].decisionId);
  });

  it("disposes future diagnostics and tolerates repeated cleanup", async () => {
    const instance = managedRegistration();
    instance.observe("before-disposal");
    await waitForDiagnosticEventsDrained();
    const before = instance.info.mock.calls.length;
    instance.dispose();
    instance.dispose();
    emitNativePair("after-disposal");
    await waitForDiagnosticEventsDrained();
    expect(instance.info).toHaveBeenCalledTimes(before);
  });

  it("replaces registrations repeatedly without duplicate active observations", async () => {
    const retired = [];
    for (let i = 0; i < 3; i += 1) {
      const instance = managedRegistration();
      instance.observe(`retired-${i}`);
      await waitForDiagnosticEventsDrained();
      expect(instance.observations()).toHaveLength(2);
      instance.dispose();
      instance.dispose();
      retired.push(instance);
    }
    const replacement = managedRegistration();
    replacement.observe("replacement-run");
    await waitForDiagnosticEventsDrained();
    expect(replacement.observations()).toHaveLength(2);
    for (const instance of retired) expect(instance.observations()).toHaveLength(2);
  });

  it("does not attach an unmanaged native listener and retains agent-end observations", async () => {
    const on = vi.fn();
    const info = vi.fn();
    const warn = vi.fn();
    plugin.register({
      pluginConfig: { mode: "shadow" }, registerHook: vi.fn(), on,
      logger: { info, warn, error: vi.fn(), debug: vi.fn() },
    } as never);
    emitNativePair("unmanaged-run");
    await waitForDiagnosticEventsDrained();
    expect(info).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("managed disposal unavailable"));
    const end = on.mock.calls.find(([name]) => name === "agent_end")?.[1] as
      (event: { runId: string }, ctx: { modelProviderId: string; modelId: string }) => void;
    end({ runId: "unmanaged-run" }, { modelProviderId: "openai", modelId: "gpt-6-sol" });
    expect(JSON.parse(info.mock.calls[0]![0].slice("[deterministic-router] ".length))).toMatchObject({
      source: "agent_end_context", verificationLevel: "runtime-model", resolvedModel: "gpt-6-sol",
    });
  });

  it("releases the native listener if managed cleanup registration rejects", async () => {
    const info = vi.fn();
    expect(() => plugin.register({
      pluginConfig: { mode: "shadow" }, registerHook: vi.fn(), on: vi.fn(),
      lifecycle: { onDispose: () => { throw new Error("instance disposed"); } },
      logger: { info, warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    } as never)).toThrow("instance disposed");
    emitNativePair("rejected-registration");
    await waitForDiagnosticEventsDrained();
    expect(info).not.toHaveBeenCalled();
  });

  it("uses exact agent-scoped latest reads and keeps a reset user selection locked", () => {
    const on = vi.fn();
    const info = vi.fn();
    let entry = {
      sessionId: "retained-session", lifecycleRevision: "before-reset",
      providerOverride: "openai", modelOverride: "gpt-6-sol", modelOverrideSource: "user",
    };
    const getSessionEntry = vi.fn(({ agentId, sessionKey, readConsistency }: {
      agentId?: string; sessionKey: string; readConsistency?: "latest";
    }) => {
      expect(sessionKey).toBe("shared-key");
      expect(readConsistency).toBe("latest");
      if (agentId === "locked-agent") return entry;
      if (agentId === "default-agent") return { sessionId: "default-session" };
      throw new Error("unexpected agent scope");
    });
    plugin.register({
      pluginConfig: {
        mode: "auto",
        autoSessionKeyHashes: [createHash("sha256").update("shared-key", "utf8").digest("hex")],
      }, registerHook: vi.fn(), on,
      runtime: { agent: { session: { getSessionEntry } } },
      logger: { info, warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    } as never);
    const resolve = on.mock.calls.find(([name]) => name === "before_model_resolve")?.[1] as
      (event: { prompt: string }, ctx: { sessionKey: string; runId: string; agentId: string }) => unknown;
    const probe = (agentId: string, runId: string) => resolve({ prompt: "Hello" }, { sessionKey: "shared-key", runId, agentId });
    expect(probe("locked-agent", "before-reset")).toBeUndefined();
    expect(probe("default-agent", "independent-default")).toMatchObject({ modelOverride: expect.any(String) });
    entry = { ...entry, lifecycleRevision: "after-reset" };
    expect(probe("locked-agent", "after-reset")).toBeUndefined();
    expect(getSessionEntry.mock.calls.map(([params]) => params)).toEqual([
      { agentId: "locked-agent", sessionKey: "shared-key", readConsistency: "latest" },
      { agentId: "default-agent", sessionKey: "shared-key", readConsistency: "latest" },
      { agentId: "locked-agent", sessionKey: "shared-key", readConsistency: "latest" },
    ]);
    const audits = info.mock.calls.map(([message]) => JSON.parse(message.slice("[deterministic-router] ".length)));
    expect(audits.map(({ manualLock, applied }) => ({ manualLock, applied }))).toEqual([
      { manualLock: true, applied: false }, { manualLock: false, applied: true }, { manualLock: true, applied: false },
    ]);
  });

  it("reports the captured registration identity and mode when a replacement registers", () => {
    const readStatus = (pluginConfig: Record<string, unknown>) => {
      const registerGatewayMethod = vi.fn();
      plugin.register({
        pluginConfig,
        registerGatewayMethod,
        registerHook: vi.fn(),
        on: vi.fn(),
      } as never);

      const handler = registerGatewayMethod.mock.calls[0]?.[1] as (params: {
        respond: (ok: boolean, payload?: unknown, error?: unknown) => void;
      }) => void;
      const respond = vi.fn();
      handler({ respond });
      return respond.mock.calls[0]?.[1] as Record<string, unknown>;
    };

    const shadow = readStatus({ mode: "shadow" });
    const replacement = readStatus({
      mode: "auto",
      protectManualSelection: false,
      requireSessionKeyForAuto: false,
      autoSessionKeyHashes: ["a".repeat(64)],
    });

    expect(shadow).toMatchObject({ status: "available", mode: "shadow" });
    expect(replacement).toMatchObject({
      status: "available",
      pluginId: "deterministic-router",
      mode: "auto",
      protectManualSelection: false,
      requireSessionKeyForAuto: false,
      autoSessionAllowlistCount: 1,
    });
    expect(replacement.registrationId).not.toBe(shadow.registrationId);
  });

  it("uses distinct status identities across separately loaded module generations", async () => {
    const loadGeneration = async (generation: string) => {
      const sourceUrl = pathToFileURL(new URL("../src/index.ts", import.meta.url).pathname);
      sourceUrl.searchParams.set("generation", generation);
      const generationPlugin = (await import(sourceUrl.href)).default as typeof plugin;
      const registerGatewayMethod = vi.fn();
      generationPlugin.register({
        pluginConfig: { mode: "shadow" }, registerGatewayMethod,
        registerHook: vi.fn(), on: vi.fn(),
      } as never);
      const status = registerGatewayMethod.mock.calls[0]?.[1] as (params: {
        respond: (ok: boolean, payload?: unknown, error?: unknown) => void;
      }) => void;
      let payload: Record<string, unknown> | undefined;
      status({ respond: (_ok, value) => { payload = value as Record<string, unknown>; } });
      return payload?.registrationId;
    };

    const first = await loadGeneration(`generation-${randomUUID()}`);
    const second = await loadGeneration(`generation-${randomUUID()}`);
    expect(first).toEqual(expect.any(String));
    expect(second).toEqual(expect.any(String));
    expect(second).not.toBe(first);
  });

  it("reports unknown effective state instead of inventing a mode without plugin config", () => {
    const registerGatewayMethod = vi.fn();
    plugin.register({
      pluginConfig: undefined,
      registerGatewayMethod,
      registerHook: vi.fn(),
      on: vi.fn(),
    } as never);

    const handler = registerGatewayMethod.mock.calls[0]?.[1] as (params: {
      respond: (ok: boolean, payload?: unknown, error?: unknown) => void;
    }) => void;
    const respond = vi.fn();
    handler({ respond });
    expect(respond).toHaveBeenCalledWith(true, expect.objectContaining({
      status: "unknown",
      mode: null,
      effectiveMode: null,
      protectManualSelection: null,
      requireSessionKeyForAuto: null,
      autoSessionAllowlistCount: null,
    }), undefined);
  });

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
    const registerGatewayMethod = vi.fn();

    const pluginConfig = Object.freeze({ mode: "shadow" });
    const api = {
      pluginConfig,
      registerHook,
      registerGatewayMethod,
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
    expect(registerGatewayMethod).toHaveBeenCalledWith(
      "deterministic-router.status",
      expect.any(Function),
      { scope: "operator.read", profileAccess: "independent" },
    );
    const statusHandler = registerGatewayMethod.mock.calls[0]?.[1] as (params: {
      respond: (ok: boolean, payload?: unknown, error?: unknown) => void;
    }) => void;
    const respond = vi.fn();
    statusHandler({ respond });
    expect(respond).toHaveBeenCalledWith(true, expect.objectContaining({
      status: "available",
      pluginId: "deterministic-router",
      mode: "shadow",
      protectManualSelection: true,
      requireSessionKeyForAuto: true,
      autoSessionAllowlistCount: 0,
      registrationId: expect.any(String),
    }), undefined);
    expect(pluginConfig).toEqual({ mode: "shadow" });
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
        modelOverride: "gpt-6-sol",
      },
      automatic: { sessionId: "automatic-session" },
    };
    const getSessionEntry = vi.fn(({ sessionKey }: { sessionKey: string }) => entries[sessionKey]);
    const api = {
      pluginConfig: {
        mode: "auto",
        autoSessionKeyHashes: [createHash("sha256").update("automatic").digest("hex")],
      },
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

  it("fails closed on malformed identity/selection and only resumes for a known-clear incarnation", () => {
    const on = vi.fn();
    const info = vi.fn();
    const key = "allowlisted-lifecycle-key";
    let entry: unknown = { sessionId: "first", providerOverride: "openai", modelOverride: "gpt-6-sol", modelOverrideSource: "user" };
    const getSessionEntry = vi.fn(() => entry);
    plugin.register({
      pluginConfig: { mode: "auto", autoSessionKeyHashes: [createHash("sha256").update(key).digest("hex")] },
      registerHook: vi.fn(), on,
      runtime: { agent: { session: { getSessionEntry } } },
      logger: { info, warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    } as never);
    const resolve = on.mock.calls.find(([name]) => name === "before_model_resolve")?.[1] as
      (event: { prompt: string }, ctx: { sessionKey: string; runId: string; agentId?: string }) => unknown;
    const probe = (runId: string, agentId?: string) => resolve({ prompt: "Reply with one word: ready" }, { sessionKey: key, runId, agentId });
    expect(probe("locked", "agent")).toBeUndefined();
    for (const [runId, value] of [
      ["missing", undefined],
      ["no-id", { modelOverrideSource: "default" }],
      ["partial", { sessionId: "second", modelOverrideSource: "user", providerOverride: "openai" }],
      ["invalid-source", { sessionId: "second", modelOverrideSource: "other" }],
    ] as const) {
      entry = value;
      expect(probe(runId, "agent")).toBeUndefined();
    }
    entry = { sessionId: "second", modelOverrideSource: "default" };
    expect(probe("no-agent")).toBeUndefined();
    expect(probe("clear-after-recreate", "agent")).toMatchObject({ modelOverride: expect.any(String) });
    const audits = info.mock.calls.map(([message]) => typeof message === "string" && message.startsWith("[deterministic-router] ")
      ? JSON.parse(message.slice("[deterministic-router] ".length)) : null).filter(Boolean);
    expect(audits.filter((x) => x.applied).map((x) => x.runId)).toEqual(["clear-after-recreate"]);
    expect(audits.filter((x) => ["missing", "no-id", "partial", "invalid-source", "no-agent"].includes(x.runId))
      .every((x) => x.manualLock === false && x.applied === false)).toBe(true);
  });

  it("fails closed for every session not explicitly allowlisted for AUTO", () => {
    const on = vi.fn();
    const info = vi.fn();
    const allowedKey = "only-this-session";
    const api = {
      pluginConfig: {
        mode: "auto",
        autoSessionKeyHashes: [createHash("sha256").update(allowedKey).digest("hex")],
      },
      registerHook: vi.fn(),
      on,
      runtime: { agent: { session: { getSessionEntry: vi.fn(() => ({ sessionId: "row" })) } } },
      logger: { info, warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    };
    plugin.register(api as never);

    const beforeModelResolve = on.mock.calls.find(([name]) => name === "before_model_resolve")?.[1] as
      (event: { prompt: string }, ctx: { sessionKey: string; runId: string; agentId: string }) => unknown;
    expect(beforeModelResolve(
      { prompt: "Summarize this short note." },
      { sessionKey: allowedKey, runId: "allowed-run", agentId: "test-agent" },
    )).toMatchObject({ providerOverride: expect.any(String), modelOverride: expect.any(String) });
    expect(beforeModelResolve(
      { prompt: "Summarize this short note." },
      { sessionKey: "same-agent-unrelated-session", runId: "unrelated-run", agentId: "test-agent" },
    )).toBeUndefined();

    const audit = info.mock.calls
      .map(([message]) => typeof message === "string" ? message : undefined)
      .find((message): message is string => message !== undefined && message.includes('"runId":"unrelated-run"'));
    expect(audit).toBeDefined();
    expect(audit).not.toContain("same-agent-unrelated-session");
    expect(JSON.parse(audit!.slice("[deterministic-router] ".length))).toMatchObject({
      mode: "auto",
      applied: false,
      reason: "session is not allowlisted for AUTO; fail-closed without override",
    });
  });

  it("keeps AUTO inert with an empty allowlist even for a valid session", () => {
    const on = vi.fn();
    const info = vi.fn();
    const api = {
      pluginConfig: { mode: "auto", autoSessionKeyHashes: [] },
      registerHook: vi.fn(),
      on,
      runtime: { agent: { session: { getSessionEntry: vi.fn(() => ({ sessionId: "known-clear" })) } } },
      logger: { info, warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    };
    plugin.register(api as never);

    const beforeModelResolve = on.mock.calls.find(([name]) => name === "before_model_resolve")?.[1] as
      (event: { prompt: string }, ctx: { sessionKey: string; runId: string; agentId: string }) => unknown;
    expect(beforeModelResolve(
      { prompt: "Summarize this short note." },
      { sessionKey: "empty-list-session", runId: "empty-list-run", agentId: "test-agent" },
    )).toBeUndefined();

    const audit = info.mock.calls
      .map(([message]) => typeof message === "string" ? message : undefined)
      .find((message): message is string => message !== undefined && message.includes('"runId":"empty-list-run"'));
    expect(audit).toBeDefined();
    expect(JSON.parse(audit!.slice("[deterministic-router] ".length))).toMatchObject({
      mode: "auto",
      manualLock: false,
      applied: false,
      reason: "session is not allowlisted for AUTO; fail-closed without override",
    });
  });

  it("fails closed when a configured AUTO allowlist contains any invalid digest", () => {
    const on = vi.fn();
    const validDigest = createHash("sha256").update("listed-session").digest("hex");
    const api = {
      pluginConfig: { mode: "auto", autoSessionKeyHashes: [validDigest, "not-a-digest"] },
      registerHook: vi.fn(),
      on,
      runtime: { agent: { session: { getSessionEntry: vi.fn(() => ({ sessionId: "known-clear" })) } } },
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    };
    plugin.register(api as never);

    const beforeModelResolve = on.mock.calls.find(([name]) => name === "before_model_resolve")?.[1] as
      (event: { prompt: string }, ctx: { sessionKey: string; runId: string; agentId: string }) => unknown;
    expect(beforeModelResolve(
      { prompt: "Summarize this short note." },
      { sessionKey: "listed-session", runId: "invalid-list-run", agentId: "test-agent" },
    )).toBeUndefined();
  });

  it("does not resolve session state or route when mode is off", () => {
    const on = vi.fn();
    const getSessionEntry = vi.fn(() => ({ sessionId: "known-clear" }));
    const info = vi.fn();
    plugin.register({
      pluginConfig: { mode: "off", autoSessionKeyHashes: ["a".repeat(64)] },
      registerHook: vi.fn(),
      on,
      runtime: { agent: { session: { getSessionEntry } } },
      logger: { info, warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    } as never);

    const beforeModelResolve = on.mock.calls.find(([name]) => name === "before_model_resolve")?.[1] as
      (event: { prompt: string }, ctx: { sessionKey: string; runId: string; agentId: string }) => unknown;
    expect(beforeModelResolve(
      { prompt: "Summarize this short note." },
      { sessionKey: "off-session", runId: "off-run", agentId: "test-agent" },
    )).toBeUndefined();
    expect(getSessionEntry).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
  });

  it("fails closed and drops a stale lock when the authoritative session entry disappears", () => {
    const registerHook = vi.fn();
    const on = vi.fn();
    const info = vi.fn();
    let entry: unknown = {
      sessionId: "session-before-delete",
      providerOverride: "openai",
        modelOverride: "gpt-6-sol",
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
