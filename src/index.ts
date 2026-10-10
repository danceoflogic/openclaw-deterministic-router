import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { InboundAttachmentRegistry, mergeAttachmentSummaries } from "./attachment-observation.js";
import { parsePluginConfig } from "./config.js";
import { onNativeModelCallDiagnostic } from "./native-diagnostics.js";
import { routeWork } from "./route-work.js";
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
): SessionLockState {
  if (!sessionKey) return "unknown";

  const sessionApi = (api as SessionReaderApi).runtime?.agent?.session;
  if (!sessionApi || typeof sessionApi.getSessionEntry !== "function") {
    locks.markUnknown(sessionKey);
    return "unknown";
  }

  try {
    const sessionEntry = sessionApi.getSessionEntry({
      ...(agentId ? { agentId } : {}),
      readConsistency: "latest",
      sessionKey,
    });
    reconcilePersistedSessionEntry(locks, sessionKey, sessionEntry);
  } catch {
    // A failed or unavailable authoritative read must never fall back to the
    // previous process-local lock: that would allow a stale lock or stale
    // absence of a lock to influence AUTO after restart/reset.
    locks.markUnknown(sessionKey);
  }

  return locks.getState(sessionKey);
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
      const config = parsePluginConfig(api.pluginConfig);
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

      const sessionKey = ctx.sessionKey;
      const selectionState = config.protectManualSelection
        ? reconcileCurrentSession(api, locks, sessionKey, ctx.agentId)
        : "clear";
      const manualLock = Boolean(
        config.protectManualSelection && selectionState === "locked",
      );
      const manualSelectionUnknown = Boolean(
        config.protectManualSelection && selectionState === "unknown",
      );

      const missingSessionKey = config.requireSessionKeyForAuto && !sessionKey;
      const applied = config.mode === "auto"
        && !manualLock
        && !manualSelectionUnknown
        && !missingSessionKey;

      const reason = manualLock
        ? "manual session model selection detected; router yielded"
        : manualSelectionUnknown
          ? "persisted session model selection unavailable; fail-closed without override"
          : missingSessionKey
            ? "session identity unavailable; fail-closed without override"
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
    onNativeModelCallDiagnostic((event) => {
      const telemetry = event.type === "model.call.started"
        ? calls.recordNativeModelCallStarted(event)
        : calls.recordNativeModelCallEnded(event);
      api.logger?.info?.(`[deterministic-router] ${JSON.stringify(telemetry)}`);
    });

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
