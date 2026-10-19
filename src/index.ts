import { createHash, randomUUID } from "node:crypto";
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { InboundAttachmentRegistry, mergeAttachmentSummaries } from "./attachment-observation.js";
import { parsePluginConfig } from "./config.js";
import { onNativeModelCallDiagnostic } from "./native-diagnostics.js";
import { routeWork } from "./route-work.js";
import { CODEX_STAGE_ROUTER, createStageRoutingSession, type StageRouterStart } from "./codex-stage-adapter.js";
import type { RouterTier } from "./types.js";
import { isAuthorizedDirectSpawn } from "./spawn-grant.js";
import {
  applySessionPatch,
  reconcilePersistedSessionEntry,
  SessionLockRegistry,
  type SessionLockState,
} from "./session-lock.js";
import {
  makeAuditRecord,
  ModelCallCorrelationRegistry,
} from "./telemetry.js";

type SessionReaderApi = {
  runtime?: {
    agent?: {
      session?: {
        getSessionEntry?: (params: {
          agentId?: string;
          readConsistency?: "latest";
          sessionKey: string;
        }) => unknown;
      };
    };
  };
};

function reconcileCurrentSession(
  api: unknown,
  locks: SessionLockRegistry,
  sessionKey: string | undefined,
  agentId: string | undefined,
): { state: SessionLockState; entry?: unknown } {
  if (!sessionKey || !agentId) {
    if (sessionKey) locks.markUnknown(sessionKey);
    return { state: "unknown" };
  }

  const sessionApi = (api as SessionReaderApi).runtime?.agent?.session;
  if (!sessionApi || typeof sessionApi.getSessionEntry !== "function") {
    locks.markUnknown(sessionKey);
    return { state: "unknown" };
  }

  try {
    const sessionEntry = sessionApi.getSessionEntry({
      ...(agentId ? { agentId } : {}),
      readConsistency: "latest",
      sessionKey,
    });
    reconcilePersistedSessionEntry(locks, sessionKey, sessionEntry);
    return { state: locks.getState(sessionKey), entry: sessionEntry };
  } catch {
    // A failed or unavailable authoritative read must never fall back to the
    // previous process-local lock: that would allow a stale lock or stale
    // absence of a lock to influence AUTO after restart/reset.
    locks.markUnknown(sessionKey);
  }

  return { state: locks.getState(sessionKey) };
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
    const calls = new ModelCallCorrelationRegistry();
    const inbound = new InboundAttachmentRegistry();
    const pluginConfigAvailable = typeof api.pluginConfig === "object"
      && api.pluginConfig !== null
      && !Array.isArray(api.pluginConfig);
    const registeredConfig = parsePluginConfig(api.pluginConfig);
    const stageEnabled = process.env.OPENCLAW_EXPERIMENTAL_STAGE_ROUTING === "1";
    const stageTiers = new Map<string, RouterTier>();
    if (stageEnabled && api.lifecycle?.onDispose) {
      const registry = globalThis as unknown as Record<symbol, unknown>;
      const factory = (start: StageRouterStart) => {
        const originalTier = stageTiers.get(start.runId);
        const hash = createHash("sha256").update(start.sessionKey).digest("hex");
        if (!originalTier || registeredConfig.mode !== "auto"
          || !registeredConfig.protectManualSelection || !registeredConfig.requireSessionKeyForAuto
          || !registeredConfig.autoSessionKeyHashes.includes(hash)) return;
        return createStageRoutingSession({ config: registeredConfig, originalTier,
          originalModel: start.originalModel,
          readManualState: () => {
            // A disposed plugin generation cannot continue authorising changes.
            if (registry[CODEX_STAGE_ROUTER] !== factory) return "unknown";
            const state = reconcileCurrentSession(api, locks, start.sessionKey, start.agentId).state;
            return state === "locked" ? "manual" : state;
          },
          readManualEffortState: () => {
            if (registry[CODEX_STAGE_ROUTER] !== factory) return "unknown";
            const current = reconcileCurrentSession(api, locks, start.sessionKey, start.agentId);
            if (current.state !== "clear") return current.state === "locked" ? "manual" : "unknown";
            const entry = current.entry as Record<string, unknown> | undefined;
            // Session thinking selections are explicit overrides; agent defaults are not.
            return entry?.thinkingLevel != null || entry?.reasoningEffort != null ? "manual" : "clear";
          },
          audit: (record) => api.logger?.info?.(`[deterministic-router] ${JSON.stringify({ ...record, runId: start.runId })}`),
        });
      };
      registry[CODEX_STAGE_ROUTER] = factory;
      api.lifecycle.onDispose(() => {
        if (registry[CODEX_STAGE_ROUTER] === factory) delete registry[CODEX_STAGE_ROUTER];
        stageTiers.clear();
      });
    }
    // A module-local counter can restart when OpenClaw loads a fresh module
    // generation. UUID identity remains unique across those generations.
    const registrationId = randomUUID();

    // Read-only proof of the configuration captured by this loaded plugin
    // registration. Changed plugin settings replace the registration as one
    // published generation (see OpenClaw 2026.9.8 plugin lifecycle docs).
    api.registerGatewayMethod?.(
      "deterministic-router.status",
      ({ respond }) => {
        respond(true, {
          status: pluginConfigAvailable ? "available" : "unknown",
          pluginId: "deterministic-router",
          registrationId,
          mode: pluginConfigAvailable ? registeredConfig.mode : null,
          effectiveMode: pluginConfigAvailable ? registeredConfig.mode : null,
          protectManualSelection: pluginConfigAvailable ? registeredConfig.protectManualSelection : null,
          requireSessionKeyForAuto: pluginConfigAvailable ? registeredConfig.requireSessionKeyForAuto : null,
          autoSessionAllowlistCount: pluginConfigAvailable ? registeredConfig.autoSessionKeyHashes.length : null,
          autoSpawnParentGrantCount: pluginConfigAvailable ? registeredConfig.autoSpawnParentGrants.length : null,
        }, undefined);
      },
      { scope: "operator.read", profileAccess: "independent" },
    );

    // Gateway document uploads are staged on ctx.media before model resolution.
    // Keep only structural facts and a classification of the original user text.
    api.on("reply_dispatch", (event) => {
      inbound.observe(event);
    });

    // Internal colon-style event. Kept separate from typed api.on hooks.
    api.registerHook(
      "session:patch",
      (event: unknown) => {
        const { sessionKey, patch, sessionEntry } = getSessionPatchEvent(event);
        const action = applySessionPatch(locks, sessionKey, patch, sessionEntry);
        if (action !== "ignored") {
          api.logger?.debug?.(
            `[deterministic-router] manual-lock ${action}`,
          );
        }
      },
      {
        name: "deterministic-router-session-patch",
        description: "Tracks manual session model selections for deterministic routing.",
      },
    );

    api.on("before_model_resolve", (event, ctx) => {
      const config = registeredConfig;
      if (config.mode === "off") return;

      const inboundObservation = inbound.consume(ctx.runId, ctx.sessionKey);
      const attachmentSummary = mergeAttachmentSummaries(
        event.attachments,
        inboundObservation?.media,
      );
      const decision = routeWork(
        {
          prompt: event.prompt,
          attachmentCount: attachmentSummary.attachmentCount,
          ...(inboundObservation?.classification
            ? { classification: inboundObservation.classification }
            : {}),
        },
        config,
      );
      if (stageEnabled && ctx.runId) stageTiers.set(ctx.runId, decision.effectiveTier);

      const sessionKey = ctx.sessionKey;
      const session = config.protectManualSelection
        ? reconcileCurrentSession(api, locks, sessionKey, ctx.agentId)
        : { state: "clear" as const };
      const selectionState = session.state;
      const manualLock = Boolean(
        config.protectManualSelection && selectionState === "locked",
      );
      const manualSelectionUnknown = Boolean(
        config.protectManualSelection && selectionState === "unknown",
      );

      const missingSessionKey = config.requireSessionKeyForAuto && !sessionKey;
      const sessionHash = sessionKey
        ? createHash("sha256").update(sessionKey, "utf8").digest("hex")
        : undefined;
      const exactSessionAllowed = Boolean(
        sessionHash && config.autoSessionKeyHashes.includes(sessionHash),
      );
      const spawnedChildAllowed = config.mode === "auto"
        && !exactSessionAllowed
        && config.protectManualSelection
        && config.requireSessionKeyForAuto
        && selectionState === "clear"
        && isAuthorizedDirectSpawn({
          agentId: ctx.agentId,
          childSessionKey: sessionKey,
          childEntry: session.entry,
          grants: config.autoSpawnParentGrants,
          readSession: (api as SessionReaderApi).runtime?.agent?.session?.getSessionEntry as
            ((params: { agentId: string; readConsistency: "latest"; sessionKey: string }) => unknown) | undefined,
        });
      const sessionNotAllowlisted = config.mode === "auto"
        && !exactSessionAllowed && !spawnedChildAllowed;
      const applied = config.mode === "auto"
        && !manualLock
        && !manualSelectionUnknown
        && !missingSessionKey
        && !sessionNotAllowlisted;

      const reason = manualLock
        ? "manual session model selection detected; router yielded"
        : manualSelectionUnknown
          ? "persisted session model selection unavailable; fail-closed without override"
          : missingSessionKey
            ? "session identity unavailable; fail-closed without override"
            : sessionNotAllowlisted
              ? "session is not allowlisted for AUTO; fail-closed without override"
              : decision.reason;

      const audit = makeAuditRecord({
        decision,
        mode: config.mode,
        sessionKey,
        agentId: ctx.agentId,
        runId: ctx.runId,
        ...attachmentSummary,
        manualLock,
        applied,
        autoAuthorization: applied
          ? spawnedChildAllowed ? "spawn-parent" : "exact-session"
          : undefined,
        reason,
      });

      calls.recordDecision(audit);
      api.logger?.info?.(`[deterministic-router] ${JSON.stringify(audit)}`);

      if (!applied) return;

      return {
        providerOverride: decision.target.provider,
        modelOverride: decision.target.model,
      };
    });

    api.on("model_call_started", (event) => {
      const telemetry = calls.recordCallStarted(event);
      api.logger?.info?.(`[deterministic-router] ${JSON.stringify(telemetry)}`);
    });

    api.on("model_call_ended", (event) => {
      const telemetry = calls.recordCallEnded(event);
      api.logger?.info?.(`[deterministic-router] ${JSON.stringify(telemetry)}`);
    });

    // Native Codex app-server emits trusted model.call.* diagnostics at turn
    // scope. Keep these separate from embedded provider-call hooks: one turn
    // may contain hidden provider requests, retries, or tool work.
    // Native subscriptions are not automatically retired with typed hooks.
    // Never attach one without an owner that can release it on replacement.
    if (api.lifecycle?.onDispose) {
      const unsubscribe = onNativeModelCallDiagnostic((event) => {
        const telemetry = event.type === "model.call.started"
          ? calls.recordNativeModelCallStarted(event)
          : calls.recordNativeModelCallEnded(event);
        api.logger?.info?.(`[deterministic-router] ${JSON.stringify(telemetry)}`);
      });
      try {
        api.lifecycle.onDispose(unsubscribe);
      } catch (error) {
        // A rejected cleanup registration must not strand a process listener.
        unsubscribe();
        throw error;
      }
    } else {
      api.logger?.warn?.(
        "[deterministic-router] native turn diagnostics disabled: managed disposal unavailable; agent_end runtime-model observation remains available",
      );
    }

    // OpenClaw emits this as the final event for a run. It is the authoritative
    // cleanup point; the registry also has a bounded stale/inactive backstop.
    api.on("agent_end", (event, ctx) => {
      const runId = typeof event.runId === "string" && event.runId.length > 0
        ? event.runId
        : ctx.runId;
      const observation = calls.recordResolvedModelObservation({
        runId,
        provider: ctx.modelProviderId,
        model: ctx.modelId,
      });
      if (observation) {
        api.logger?.info?.(`[deterministic-router] ${JSON.stringify(observation)}`);
      }
      calls.completeRun(runId);
      if (runId) stageTiers.delete(runId);
      inbound.complete(runId);
    });
  },
});

export { classifyLocally, estimateTokens } from "./classifier.js";
export { parsePluginConfig, DEFAULT_PLUGIN_CONFIG } from "./config.js";
export { maxTier, resolveTier } from "./policy.js";
export { routeWork } from "./route-work.js";
export {
  applySessionPatch,
  reconcilePersistedSessionEntry,
  SessionLockRegistry,
} from "./session-lock.js";
export type * from "./types.js";
