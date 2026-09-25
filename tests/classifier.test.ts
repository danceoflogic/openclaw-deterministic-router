import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classifyLocally, estimateTokens } from "../src/classifier.js";
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
