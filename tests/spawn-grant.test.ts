import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { isAuthorizedDirectSpawn } from "../src/spawn-grant.js";

const agentId = "main";
const parentSessionKey = "agent:main:dashboard:trusted-parent";
const childSessionKey = "agent:main:subagent:83751ee6-aafb-46a5-ab2a-b30b90b3a3d7";
const grant = {
  parentSessionKeyHash: createHash("sha256").update(parentSessionKey).digest("hex"),
  parentSessionId: "parent-generation",
  parentLifecycleRevision: "parent-revision",
  parentCreatorProfileId: "owner-profile",
};
const parent = {
  sessionId: grant.parentSessionId,
  lifecycleRevision: grant.parentLifecycleRevision,
  createdVia: "operator",
  createdActor: { type: "human", source: "profile", id: grant.parentCreatorProfileId },
  spawnDepth: 0,
};
const child = {
  sessionId: "child-generation",
  lifecycleRevision: "child-revision",
  createdVia: "spawn",
  createdActor: { type: "agent", id: agentId },
  spawnDepth: 1,
  modelOverrideSource: "auto",
  providerOverride: "openai",
  modelOverride: "gpt-6-sol",
  parentSessionKey,
  spawnedBy: parentSessionKey,
  spawnedBySessionId: grant.parentSessionId,
  parentSessionLifecycleRevision: grant.parentLifecycleRevision,
};

describe("direct-child AUTO grant", () => {
  function allowed(childEntry: unknown = child, parentEntry: unknown = parent, grants = [grant]) {
    const readSession = vi.fn(() => parentEntry);
    const result = isAuthorizedDirectSpawn({ agentId, childSessionKey, childEntry, grants, readSession });
    return { result, readSession };
  }

  it("authorizes only a verified direct child of the pinned parent generation", () => {
    const { result, readSession } = allowed();
    expect(result).toBe(true);
    expect(readSession).toHaveBeenCalledWith({
      agentId, sessionKey: parentSessionKey, readConsistency: "latest",
    });
  });

  it.each([
    ["untrusted creation", { createdVia: "plugin" }],
    ["wrong creator", { createdActor: { type: "human", id: "owner-profile" } }],
    ["nested child", { spawnDepth: 2 }],
    ["human model selection", { modelOverrideSource: "user" }],
    ["missing model selection", { providerOverride: undefined }],
    ["forged parent link", { spawnedBy: "agent:main:dashboard:other" }],
    ["old parent generation", { spawnedBySessionId: "prior-generation" }],
    ["old parent revision", { parentSessionLifecycleRevision: "prior-revision" }],
    ["missing child identity", { sessionId: undefined }],
  ])("rejects %s", (_label, change) => {
    expect(allowed({ ...child, ...change }).result).toBe(false);
  });

  it.each([
    ["parent reset", { lifecycleRevision: "new-revision" }],
    ["parent recreated", { sessionId: "new-generation" }],
    ["wrong owner", { createdActor: { type: "human", source: "profile", id: "other" } }],
    ["untrusted owner source", { createdActor: { type: "human", source: "unknown", id: "owner-profile" } }],
    ["spawned parent", { spawnDepth: 1 }],
    ["archived parent", { archivedAt: 1 }],
  ])("rejects %s", (_label, change) => {
    expect(allowed(child, { ...parent, ...change }).result).toBe(false);
  });

  it("rejects absent grants, unavailable parent reads, and unrelated session keys", () => {
    expect(allowed(child, parent, []).result).toBe(false);
    expect(allowed(child, null).result).toBe(false);
    expect(isAuthorizedDirectSpawn({
      agentId, childSessionKey: "agent:main:dashboard:unrelated", childEntry: child,
      grants: [grant], readSession: () => parent,
    })).toBe(false);
    expect(isAuthorizedDirectSpawn({
      agentId, childSessionKey, childEntry: child, grants: [grant],
      readSession: () => { throw new Error("read unavailable"); },
    })).toBe(false);
  });
});
