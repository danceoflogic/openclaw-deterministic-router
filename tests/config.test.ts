import { describe, expect, it } from "vitest";
import { DEFAULT_PLUGIN_CONFIG, parsePluginConfig } from "../src/config.js";

describe("AUTO session allowlist configuration", () => {
  it("defaults to an empty allowlist", () => {
    expect(DEFAULT_PLUGIN_CONFIG.autoSessionKeyHashes).toEqual([]);
    expect(parsePluginConfig({ mode: "auto" }).autoSessionKeyHashes).toEqual([]);
  });

  it("rejects an entire list containing any invalid digest", () => {
    const valid = "0123456789abcdef".repeat(4);
    const parsed = parsePluginConfig({
      mode: "auto",
      autoSessionKeyHashes: [
        valid,
        valid,
        "A".repeat(64),
        "f".repeat(63),
        "g".repeat(64),
        17,
        null,
      ],
    });

    expect(parsed.autoSessionKeyHashes).toEqual([]);
  });

  it("accepts a valid list and deduplicates it", () => {
    const valid = "0123456789abcdef".repeat(4);
    const parsed = parsePluginConfig({ autoSessionKeyHashes: [valid, valid] });

    expect(parsed.autoSessionKeyHashes).toEqual([valid]);
  });

  it("keeps shadow as the default mode", () => {
    expect(DEFAULT_PLUGIN_CONFIG.mode).toBe("shadow");
    expect(parsePluginConfig({}).mode).toBe("shadow");
  });

  it("keeps direct-child grants empty unless every parent incarnation field is valid", () => {
    const grant = {
      parentSessionKeyHash: "a".repeat(64),
      parentSessionId: "parent-session",
      parentLifecycleRevision: "parent-revision",
      parentCreatorProfileId: "owner-profile",
    };
    expect(parsePluginConfig({}).autoSpawnParentGrants).toEqual([]);
    expect(parsePluginConfig({ autoSpawnParentGrants: [grant, grant] }).autoSpawnParentGrants).toEqual([grant]);
    expect(parsePluginConfig({ autoSpawnParentGrants: [grant, { ...grant, parentSessionId: " " }] })
      .autoSpawnParentGrants).toEqual([]);
    expect(parsePluginConfig({ autoSpawnParentGrants: [grant, { ...grant, parentSessionKeyHash: "*" }] })
      .autoSpawnParentGrants).toEqual([]);
  });
});

it("keeps model and effort stage routing independently configurable and effort opt-in", () => {
  expect(parsePluginConfig({}).stageRouting).toEqual({ model: true, effort: false });
  expect(parsePluginConfig({ stageRouting: { model: false, effort: true } }).stageRouting).toEqual({ model: false, effort: true });
  expect(parsePluginConfig({ stageRouting: { effort: "true" } }).stageRouting?.effort).toBe(false);
});
