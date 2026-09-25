import { describe, expect, it } from "vitest";
import { DEFAULT_PLUGIN_CONFIG } from "../src/config.js";
import { resolveTier } from "../src/policy.js";

describe("deterministic policy", () => {
  it("uses the configured ambiguity fallback", () => {
    expect(resolveTier(null, 0, DEFAULT_PLUGIN_CONFIG)).toBe("COMPLEX");
  });

  it("applies the attachment floor", () => {
    expect(resolveTier("SIMPLE", 1, DEFAULT_PLUGIN_CONFIG)).toBe("MEDIUM");
  });

  it("never demotes a stronger classifier tier", () => {
    expect(resolveTier("REASONING", 1, DEFAULT_PLUGIN_CONFIG)).toBe("REASONING");
  });
});
