import type { ManualModelLock } from "./types.js";

export type SessionLockState = "locked" | "clear" | "unknown";
export type SessionLockUpdate = "set" | "cleared" | "unknown" | "ignored";

export class SessionLockRegistry {
  readonly #locks = new Map<string, ManualModelLock>();
  readonly #knownClear = new Set<string>();

  get(sessionKey: string): ManualModelLock | undefined {
    return this.#locks.get(sessionKey);
  }

  getState(sessionKey: string): SessionLockState {
    if (this.#locks.has(sessionKey)) return "locked";
    return this.#knownClear.has(sessionKey) ? "clear" : "unknown";
  }

  set(sessionKey: string, lock: Omit<ManualModelLock, "updatedAt">): void {
    this.#knownClear.delete(sessionKey);
    this.#locks.set(sessionKey, { ...lock, updatedAt: Date.now() });
  }

  clear(sessionKey: string): void {
    this.#locks.delete(sessionKey);
    this.#knownClear.add(sessionKey);
  }

  markUnknown(sessionKey: string): void {
    this.#locks.delete(sessionKey);
    this.#knownClear.delete(sessionKey);
  }

  clearAll(): void {
    this.#locks.clear();
    this.#knownClear.clear();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function firstString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === "string" && value.length > 0);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isPromiseLike(value: unknown): boolean {
  return isRecord(value) && typeof value.then === "function";
}

function hasOwn(object: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function patchTouchesModelSelection(patch: Record<string, unknown>): boolean {
  return [
    "model",
    "modelId",
    "modelOverride",
    "provider",
    "providerId",
    "providerOverride",
  ].some((key) => hasOwn(patch, key));
}

type PersistedSelectionResolution =
  | { state: "locked"; provider?: string; model?: string; sessionId?: string }
  | { state: "clear" }
  | { state: "unknown" };

const MODEL_OVERRIDE_SOURCES = new Set(["auto", "user", "default"]);

/**
 * Read only the persisted override fields. The resolved `model` and
 * `modelProvider` fields are present for ordinary sessions too and are not
 * evidence of an explicit user selection.
 */
function resolvePersistedSelection(sessionEntry: unknown): PersistedSelectionResolution {
  if (!isRecord(sessionEntry) || isPromiseLike(sessionEntry)) return { state: "unknown" };

  const source = sessionEntry.modelOverrideSource;
  if (source !== undefined && (typeof source !== "string" || !MODEL_OVERRIDE_SOURCES.has(source))) {
    return { state: "unknown" };
  }

  // OpenClaw uses this source to represent an explicit return to the
  // configured/default model, even if an older row still contains override
  // values. Treat it as authoritative clearing state.
  if (source === "default") return { state: "clear" };

  const rawProvider = sessionEntry.providerOverride;
  const rawModel = sessionEntry.modelOverride;
  const hasProvider = rawProvider !== undefined;
  const hasModel = rawModel !== undefined;

  if ((hasProvider && !isNonEmptyString(rawProvider)) || (hasModel && !isNonEmptyString(rawModel))) {
    return { state: "unknown" };
  }

  if (!hasProvider && !hasModel) {
    // A user/automatic source without a corresponding override is internally
    // inconsistent. Do not turn that ambiguity into permission to override.
    return source === undefined ? { state: "clear" } : { state: "unknown" };
  }

  return {
    state: "locked",
    provider: rawProvider,
    model: rawModel,
    sessionId: firstString(sessionEntry.sessionId),
  };
}

function applyPersistedSelection(
  registry: SessionLockRegistry,
  sessionKey: string,
  resolution: PersistedSelectionResolution,
): Exclude<SessionLockUpdate, "ignored"> {
  if (resolution.state === "locked") {
    registry.set(sessionKey, {
      provider: resolution.provider,
      model: resolution.model,
      sessionId: resolution.sessionId,
    });
    return "set";
  }

  if (resolution.state === "clear") {
    registry.clear(sessionKey);
    return "cleared";
  }

  registry.markUnknown(sessionKey);
  return "unknown";
}

/**
 * Reconcile one session against OpenClaw's authoritative persisted session
 * entry. A missing or malformed entry clears any stale in-memory lock and
 * leaves the registry in an unknown state so AUTO can fail closed.
 */
export function reconcilePersistedSessionEntry(
  registry: SessionLockRegistry,
  sessionKey: string | undefined,
  sessionEntry: unknown,
): SessionLockUpdate {
  if (!sessionKey) return "ignored";
  return applyPersistedSelection(registry, sessionKey, resolvePersistedSelection(sessionEntry));
}

/**
 * Consume OpenClaw's `session:patch` notification and maintain a conservative
 * per-session model-selection lock.
 *
 * Current OpenClaw emits a request-shaped `patch` plus the cloned
 * post-operation `sessionEntry`. We prefer that post-operation entry because
 * it tells us whether an override actually remains after default-model
 * normalization. Any persisted session model selection is treated as
 * authoritative for safety; the router yields instead of guessing whether the
 * selection came from a human picker, `/model`, or another supported path.
 *
 * The optional `sessionEntry` parameter keeps this parser easy to unit-test and
 * provides a compatibility fallback for runtimes that expose only the patch.
 */
export function applySessionPatch(
  registry: SessionLockRegistry,
  sessionKey: string | undefined,
  patch: unknown,
  sessionEntry?: unknown,
): SessionLockUpdate {
  if (!sessionKey || !isRecord(patch)) return "ignored";
  if (!patchTouchesModelSelection(patch)) return "ignored";

  if (isRecord(sessionEntry)) {
    return applyPersistedSelection(registry, sessionKey, resolvePersistedSelection(sessionEntry));
  }

  // Compatibility fallback when a runtime does not expose sessionEntry.
  const model = firstString(patch.modelOverride, patch.model, patch.modelId);
  const provider = firstString(patch.providerOverride, patch.provider, patch.providerId);

  if (model === "default" || patch.modelOverride === null || patch.model === null || patch.modelId === null) {
    registry.clear(sessionKey);
    return "cleared";
  }

  if (model || provider) {
    registry.set(sessionKey, { model, provider });
    return "set";
  }

  if (
    ["model", "modelId", "modelOverride", "provider", "providerId", "providerOverride"]
      .some((key) => hasOwn(patch, key) && patch[key] === null)
  ) {
    registry.clear(sessionKey);
    return "cleared";
  }

  registry.markUnknown(sessionKey);
  return "unknown";
}
