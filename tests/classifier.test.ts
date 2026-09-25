import { describe, expect, it } from "vitest";
import { classifyLocally } from "../src/classifier.js";

const cases = [
  "Hello",
  "Summarise this note into three concise bullets.",
  "Debug this distributed database architecture and identify the failure modes.",
  "Prove this theorem formally, step by step, and derive the result.",
];

describe("local classifier", () => {
  it("is deterministic for repeated inputs", () => {
    for (const prompt of cases) {
      const first = classifyLocally(prompt);
      for (let i = 0; i < 20; i += 1) {
        expect(classifyLocally(prompt)).toEqual(first);
      }
    }
  });

  it("recognises an explicit reasoning-heavy prompt", () => {
    const result = classifyLocally("Prove this theorem formally, step by step, and derive the result.");
    expect(result.tier).toBe("REASONING");
  });
});
