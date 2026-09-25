import type { ManualModelLock } from "./types.js";

export class SessionLockRegistry {
  readonly #locks = new Map<string, ManualModelLock>();

  get(sessionKey: string): ManualModelLock | undefined {
    return this.#locks.get(sessionKey);
  }

  set(sessionKey: string, lock: Omit<ManualModelLock, "updatedAt">): void {
    this.#locks.set(sessionKey, { ...lock, updatedAt: Date.now() });
  }

  clear(sessionKey: string): void {
    this.#locks.delete(sessionKey);
  }

  clearAll(): void {
    this.#locks.clear();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function firstString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === "string" && value.length > 0);
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
): "set" | "cleared" | "ignored" {
  if (!sessionKey || !isRecord(patch)) return "ignored";
  if (!patchTouchesModelSelection(patch)) return "ignored";

  if (isRecord(sessionEntry)) {
    const model = firstString(sessionEntry.modelOverride, sessionEntry.model, sessionEntry.modelId);
    const provider = firstString(
      sessionEntry.providerOverride,
      sessionEntry.provider,
      sessionEntry.providerId,
    );

    if (model || provider) {
      registry.set(sessionKey, { model, provider });
      return "set";
    }

    // A model-selection patch whose post-operation entry has no override means
    // OpenClaw normalized the session back to its configured default.
    registry.clear(sessionKey);
    return "cleared";
  }

  // Compatibility fallback when a runtime does not expose sessionEntry.
  const model = firstString(patch.modelOverride, patch.model, patch.modelId);
  const provider = firstString(patch.providerOverride, patch.provider, patch.providerId);

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

  return "ignored";
}
