import { expect, it } from "vitest";
import { createStageRoutingSession } from "../src/codex-stage-adapter.js";
import { DEFAULT_PLUGIN_CONFIG } from "../src/config.js";
import { CODEX_STAGE_ROUTER } from "../src/codex-stage-adapter.js";
import { createHash } from "node:crypto";
import plugin from "../src/index.js";

const routine = "Sort this provided list alphabetically; deterministic formatting only, no analysis or explanation.";
const difficult = "Prove this theorem formally, step by step, and derive the result.";

it("routes changed plan objectives once and returns to the original chosen model", () => {
  const audits: unknown[] = [];
  const route = createStageRoutingSession({ config: DEFAULT_PLUGIN_CONFIG,
    originalTier: "REASONING", originalModel: { provider: "openai", model: "gpt-6-astra" },
    readManualState: () => "clear", audit: (record) => audits.push(record) });
  expect(route({ model: "gpt-6-astra", nextObjective: routine })).toEqual({ model: "gpt-6-luna" });
  expect(route({ model: "gpt-6-luna", nextObjective: routine })).toEqual({});
  expect(route({ model: "gpt-6-luna", nextObjective: difficult })).toEqual({ model: "gpt-6-astra" });
  expect(audits).toHaveLength(2);
});

it("keeps manual/unknown selections and missing plan objectives", () => {
  for (const state of ["manual", "unknown"] as const) {
    const route = createStageRoutingSession({ config: DEFAULT_PLUGIN_CONFIG,
      originalTier: "REASONING", originalModel: { provider: "openai", model: "gpt-6-sol" },
      readManualState: () => state });
    expect(route({ model: "gpt-6-sol" })).toEqual({});
    expect(route({ model: "gpt-6-sol", nextObjective: routine })).toEqual({});
  }
});

it("binds the host bridge to an allowed run and rechecks persisted manual state", () => {
  const previous = process.env.OPENCLAW_EXPERIMENTAL_STAGE_ROUTING;
  const registry = globalThis as unknown as Record<symbol, any>;
  const hooks = new Map<string, (...args: any[]) => any>();
  const dispose: Array<() => void> = [];
  const key = "synthetic-stage-session";
  let entry: Record<string, unknown> = { sessionId: "stage-session-id" };
  try {
    process.env.OPENCLAW_EXPERIMENTAL_STAGE_ROUTING = "1";
    plugin.register({ id: "deterministic-router",
      pluginConfig: { mode: "auto", autoSessionKeyHashes: [createHash("sha256").update(key).digest("hex")] },
      on: (name: string, fn: (...args: any[]) => any) => hooks.set(name, fn),
      registerHook: () => {}, registerGatewayMethod: () => {},
      runtime: { agent: { session: { getSessionEntry: () => entry } } },
      lifecycle: { onDispose: (fn: () => void) => dispose.push(fn) }, logger: { info() {}, warn() {} },
    } as never);
    const start = { runId: "stage-run", sessionKey: key, agentId: "main",
      originalModel: { provider: "openai", model: "gpt-6-sol" } };
    expect(registry[CODEX_STAGE_ROUTER](start)).toBeUndefined();
    hooks.get("before_model_resolve")!({ prompt: difficult }, { ...start });
    const route = registry[CODEX_STAGE_ROUTER](start);
    expect(route({ model: "gpt-6-sol", nextObjective: routine })).toEqual({ model: "gpt-6-luna" });
    entry = { ...entry, providerOverride: "openai", modelOverride: "gpt-6-sol", modelOverrideSource: "user" };
    expect(route({ model: "gpt-6-sol", nextObjective: `${routine} Use ascending order.` })).toEqual({});
    expect(registry[CODEX_STAGE_ROUTER]({ ...start, sessionKey: "not-allowed" })).toBeUndefined();
  } finally {
    for (const fn of dispose.reverse()) fn();
    if (previous === undefined) delete process.env.OPENCLAW_EXPERIMENTAL_STAGE_ROUTING;
    else process.env.OPENCLAW_EXPERIMENTAL_STAGE_ROUTING = previous;
  }
}, 60_000);
