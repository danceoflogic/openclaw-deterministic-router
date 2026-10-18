import { createHash } from "node:crypto";
import type { AutoSpawnParentGrant } from "./types.js";

type SessionReader = (params: {
  agentId: string;
  readConsistency: "latest";
  sessionKey: string;
}) => unknown;

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * Admit only a Gateway-stamped, same-agent, direct native child of one
 * explicitly granted human-created parent incarnation. No key prefix or
 * in-memory spawn event alone grants routing authority.
 */
export function isAuthorizedDirectSpawn(params: {
  agentId: string | undefined;
  childSessionKey: string | undefined;
  childEntry: unknown;
  grants: AutoSpawnParentGrant[];
  readSession: SessionReader | undefined;
}): boolean {
  const { agentId, childSessionKey, grants, readSession } = params;
  if (!agentId || !childSessionKey || !readSession || grants.length === 0) return false;
  const childPrefix = `agent:${agentId}:subagent:`;
  if (!childSessionKey.startsWith(childPrefix)
    || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(childSessionKey.slice(childPrefix.length))) return false;

  const child = record(params.childEntry);
  const childActor = record(child?.createdActor);
  const parentKey = child?.parentSessionKey;
  if (!nonempty(child?.sessionId) || !nonempty(child?.lifecycleRevision)
    || child?.createdVia !== "spawn" || childActor?.type !== "agent" || childActor.id !== agentId
    || child?.spawnDepth !== 1 || child?.modelOverrideSource !== "auto"
    || !nonempty(child?.providerOverride) || !nonempty(child?.modelOverride)
    || !nonempty(parentKey) || parentKey !== child?.spawnedBy
    || !parentKey.startsWith(`agent:${agentId}:`) || parentKey.includes(":subagent:")
    || !nonempty(child?.spawnedBySessionId)
    || !nonempty(child?.parentSessionLifecycleRevision)
    || child?.archivedAt !== undefined) return false;

  const parentHash = createHash("sha256").update(parentKey, "utf8").digest("hex");
  const candidates = grants.filter(grant => grant.parentSessionKeyHash === parentHash
    && grant.parentSessionId === child.spawnedBySessionId
    && grant.parentLifecycleRevision === child.parentSessionLifecycleRevision);
  if (candidates.length === 0) return false;

  try {
    const parent = record(readSession({ agentId, sessionKey: parentKey, readConsistency: "latest" }));
    const creator = record(parent?.createdActor);
    if (!parent || parent.sessionId !== child.spawnedBySessionId
      || parent.lifecycleRevision !== child.parentSessionLifecycleRevision
      || parent.spawnDepth !== 0 || parent.archivedAt !== undefined
      || (parent.createdVia !== "operator" && parent.createdVia !== "channel")
      || creator?.type !== "human" || creator.source !== "profile"
      || !nonempty(creator.id)) return false;
    if (child.parentSessionId !== undefined && child.parentSessionId !== parent.sessionId) return false;
    return candidates.some(grant => grant.parentCreatorProfileId === creator.id);
  } catch {
    return false;
  }
}
