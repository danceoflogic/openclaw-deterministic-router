import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { parsePluginConfig } from "./config.js";
import { routeWork } from "./route-work.js";
import { applySessionPatch, SessionLockRegistry } from "./session-lock.js";
import { makeAuditRecord } from "./telemetry.js";

function attachmentCount(event: unknown): number {
  if (typeof event !== "object" || event === null) return 0;
  const attachments = (event as { attachments?: unknown }).attachments;
  return Array.isArray(attachments) ? attachments.length : 0;
}

function getSessionPatchEvent(event: unknown): {
  sessionKey?: string;
  patch?: unknown;
  sessionEntry?: unknown;
} {
  if (typeof event !== "object" || event === null) return {};
  const e = event as Record<string, unknown>;
  const context = typeof e.context === "object" && e.context !== null
    ? e.context as Record<string, unknown>
    : undefined;
  const entry = context?.sessionEntry;

  const sessionKey = [e.sessionKey, context?.sessionKey]
    .find((value): value is string => typeof value === "string" && value.length > 0);

  return {
    sessionKey,
    patch: context?.patch,
    sessionEntry: entry,
  };
}

export default definePluginEntry({
  id: "deterministic-router",
  name: "Deterministic Router",
  description: "Local, auditable model routing for OpenClaw.",
  register(api) {
    const locks = new SessionLockRegistry();

    // Internal colon-style event. Kept separate from typed api.on hooks.
    api.registerHook("session:patch", (event: unknown) => {
      const { sessionKey, patch, sessionEntry } = getSessionPatchEvent(event);
      const action = applySessionPatch(locks, sessionKey, patch, sessionEntry);
      if (action !== "ignored") {
        api.logger?.debug?.(`[deterministic-router] manual-lock ${action} session=${sessionKey ?? "unknown"}`);
      }
    });

    api.on("before_model_resolve", (event, ctx) => {
      const config = parsePluginConfig(api.pluginConfig);
      if (config.mode === "off") return;

      const decision = routeWork(
        {
          prompt: event.prompt,
          attachmentCount: attachmentCount(event),
        },
        config,
      );

      const sessionKey = ctx.sessionKey;
      const manualLock = Boolean(
        config.protectManualSelection && sessionKey && locks.get(sessionKey),
      );

      const missingSessionKey = config.requireSessionKeyForAuto && !sessionKey;
      const applied = config.mode === "auto" && !manualLock && !missingSessionKey;

      const reason = manualLock
        ? "manual session model selection detected; router yielded"
        : missingSessionKey
          ? "session identity unavailable; fail-closed without override"
          : decision.reason;

      const audit = makeAuditRecord({
        decision,
        mode: config.mode,
        sessionKey,
        agentId: ctx.agentId,
        runId: ctx.runId,
        manualLock,
        applied,
        reason,
      });

      api.logger?.info?.(`[deterministic-router] ${JSON.stringify(audit)}`);

      if (!applied) return;

      return {
        providerOverride: decision.target.provider,
        modelOverride: decision.target.model,
      };
    });
  },
});

export { classifyLocally, estimateTokens } from "./classifier.js";
export { parsePluginConfig, DEFAULT_PLUGIN_CONFIG } from "./config.js";
export { maxTier, resolveTier } from "./policy.js";
export { routeWork } from "./route-work.js";
export { applySessionPatch, SessionLockRegistry } from "./session-lock.js";
export type * from "./types.js";
