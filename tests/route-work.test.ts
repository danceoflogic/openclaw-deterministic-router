import { describe, expect, it } from "vitest";
import { DEFAULT_PLUGIN_CONFIG } from "../src/config.js";
import { routeWork } from "../src/route-work.js";

describe("routeWork", () => {
  it("maps reasoning work to the configured reasoning model", () => {
    const decision = routeWork(
      { prompt: "Prove this theorem formally, step by step, and derive the result." },
      DEFAULT_PLUGIN_CONFIG,
    );
    expect(decision.effectiveTier).toBe("REASONING");
    expect(decision.target).toEqual({ provider: "openai", model: "gpt-5.6-sol" });
  });
});
