import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classifyByRules, DEFAULT_ROUTING_CONFIG } from "@blockrun/router-core";
import { classifyLocally, estimateTokens, ROUTER_SCORING_CONFIG } from "../src/classifier.js";
import { DEFAULT_PLUGIN_CONFIG } from "../src/config.js";
import { routeWork } from "../src/route-work.js";
import type { RouterTier } from "../src/types.js";

type Fixture = {
  id: string;
  prompt: string;
  repeat?: number;
  expectedTokens: number;
  expectedClassifierTier: RouterTier | null;
  attachmentCount: number;
  expectedEffectiveTier: RouterTier;
};

const fixtures = JSON.parse(
  readFileSync(new URL("./fixtures/golden-prompts.json", import.meta.url), "utf8"),
) as Fixture[];

function promptFor(fixture: Fixture): string {
  return fixture.prompt.repeat(fixture.repeat ?? 1);
}

describe("deterministic classifier acceptance matrix", () => {
  it("freezes observed pinned-classifier and deterministic-policy outcomes", () => {
    for (const fixture of fixtures) {
      const prompt = promptFor(fixture);
      const classification = classifyLocally(prompt);
      const decision = routeWork({ prompt, attachmentCount: fixture.attachmentCount }, DEFAULT_PLUGIN_CONFIG);

      expect(estimateTokens(prompt), fixture.id).toBe(fixture.expectedTokens);
      expect(classification.tier, fixture.id).toBe(fixture.expectedClassifierTier);
      expect(decision.classifierTier, fixture.id).toBe(fixture.expectedClassifierTier);
      expect(decision.effectiveTier, fixture.id).toBe(fixture.expectedEffectiveTier);
      expect(decision.target, fixture.id).toEqual(DEFAULT_PLUGIN_CONFIG.models[decision.effectiveTier]);
    }
  });

  it("widens direct COMPLEX at the upper edge without changing the pinned dependency", () => {
    const fixture = fixtures.find((item) => item.id === "complex-upper-boundary-readonly");
    if (!fixture) throw new Error("missing upper-boundary acceptance fixture");
    const prompt = promptFor(fixture);

    // Under the unchanged, pinned upstream defaults this prompt is ambiguous.
    const upstream = classifyByRules(
      prompt,
      undefined,
      estimateTokens(prompt),
      DEFAULT_ROUTING_CONFIG.scoring,
    );
    expect(DEFAULT_ROUTING_CONFIG.scoring.tierBoundaries.complexReasoning).toBe(0.5);
    expect(ROUTER_SCORING_CONFIG.tierBoundaries.complexReasoning).toBe(0.53);
    expect(upstream.tier).toBeNull();

    // The plugin-local boundary widens direct classification, not the score.
    const local = classifyLocally(prompt);
    expect(local.score).toBe(upstream.score);
    expect(local.tier).toBe("COMPLEX");
    expect(local.confidence).toBeGreaterThanOrEqual(
      DEFAULT_ROUTING_CONFIG.scoring.confidenceThreshold,
    );

    const decision = routeWork({ prompt, attachmentCount: 0 }, DEFAULT_PLUGIN_CONFIG);
    expect(decision.classifierTier).toBe("COMPLEX");
    expect(decision.effectiveTier).toBe("COMPLEX");
    expect(decision.reason).toBe("classifier=COMPLEX");
  });

  it("uses a configured non-default fallback for ambiguous classifier results", () => {
    const ambiguousFixture = fixtures.find((fixture) => fixture.expectedClassifierTier === null);
    if (!ambiguousFixture) throw new Error("acceptance fixtures must include an ambiguous classifier result");

    const config = { ...DEFAULT_PLUGIN_CONFIG, ambiguousTier: "SIMPLE" as const };
    const decision = routeWork(
      { prompt: promptFor(ambiguousFixture), attachmentCount: ambiguousFixture.attachmentCount },
      config,
    );

    expect(decision.classifierTier).toBeNull();
    expect(decision.effectiveTier).toBe(config.ambiguousTier);
    expect(decision.target).toEqual(config.models[decision.effectiveTier]);
  });

  it("returns byte-for-byte identical classification fields for repeated identical input", () => {
    for (const fixture of fixtures) {
      const prompt = promptFor(fixture);
      const first = JSON.stringify(classifyLocally(prompt));

      for (let run = 0; run < 20; run += 1) {
        expect(JSON.stringify(classifyLocally(prompt)), `${fixture.id} run ${run + 2}`).toBe(first);
      }
    }
  });
});
