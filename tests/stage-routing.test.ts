import { describe, expect, it } from "vitest";
import { DEFAULT_PLUGIN_CONFIG } from "../src/config.js";
import { proposeStageRoute, type StageRouteInput } from "../src/stage-routing.js";

const sol = { provider: "openai", model: "gpt-6-sol" };
const luna = { provider: "openai", model: "gpt-6-luna" };
const custom = { provider: "openai", model: "gpt-6-astra" };
const routineObjective = "Summarise this note into three concise bullets. ".repeat(100);
const difficultObjective = "Prove this theorem formally, step by step, and derive the result.";

function stage(overrides: Partial<StageRouteInput> = {}): StageRouteInput {
  return {
    experimentalEnabled: true,
    manualSelectionState: "clear",
    originalTier: "REASONING",
    originalModel: sol,
    currentModel: sol,
    eligibleModels: [sol, luna],
    boundary: {
      responseCompleted: true,
      toolsSettled: true,
      objectiveChanged: true,
      nextObjective: routineObjective,
    },
    ...overrides,
  };
}

describe("offline stage-route proposal", () => {
  it("remains off by default even with an eligible next stage", () => {
    const choice = proposeStageRoute(stage({ experimentalEnabled: undefined }), DEFAULT_PLUGIN_CONFIG);
    expect(choice).toMatchObject({ shouldRequestChange: false, proposedModel: sol });
  });

  it("does not route streaming responses, pending tool batches, or unconfirmed stage changes", () => {
    for (const boundary of [
      { responseCompleted: false, toolsSettled: true, objectiveChanged: true, nextObjective: routineObjective },
      { responseCompleted: true, toolsSettled: false, objectiveChanged: true, nextObjective: routineObjective },
      { responseCompleted: true, toolsSettled: true, objectiveChanged: false, nextObjective: routineObjective },
    ]) {
      expect(proposeStageRoute(stage({ boundary }), DEFAULT_PLUGIN_CONFIG).shouldRequestChange).toBe(false);
    }
  });

  it("preserves explicit manual selections and fails closed on unknown state", () => {
    for (const manualSelectionState of ["manual", "unknown"] as const) {
      expect(proposeStageRoute(stage({ manualSelectionState }), DEFAULT_PLUGIN_CONFIG))
        .toMatchObject({ proposedModel: sol, shouldRequestChange: false });
    }
  });

  it("requires a bounded next-stage goal rather than blindly routing a short tool result", () => {
    for (const nextObjective of ["OK", "x".repeat(8193)]) {
      const proposal = proposeStageRoute(stage({
        boundary: { responseCompleted: true, toolsSettled: true, objectiveChanged: true, nextObjective },
      }), DEFAULT_PLUGIN_CONFIG);
      expect(proposal.shouldRequestChange).toBe(false);
      expect(proposal.nextTier).toBeNull();
    }
  });

  it("rejects unavailable or cross-provider targets", () => {
    expect(proposeStageRoute(stage({ eligibleModels: [sol] }), DEFAULT_PLUGIN_CONFIG).shouldRequestChange)
      .toBe(false);
    expect(proposeStageRoute(stage({ currentModel: { provider: "other", model: "other" } }), DEFAULT_PLUGIN_CONFIG)
      .shouldRequestChange).toBe(false);
  });

  it("is model-agnostic: preserves a custom original model on difficult continuation", () => {
    const choice = proposeStageRoute(stage({
      originalModel: custom,
      currentModel: luna,
      eligibleModels: [custom, luna],
      boundary: {
        responseCompleted: true,
        toolsSettled: true,
        objectiveChanged: true,
        nextObjective: difficultObjective,
      },
    }), DEFAULT_PLUGIN_CONFIG);
    expect(choice).toMatchObject({
      nextTier: "REASONING", proposedModel: custom, shouldRequestChange: true,
    });
  });

  it("models synchronised offline A -> B -> A after completed tool stages", async () => {
    // Fake Codex host: dispatch occurs only AFTER the stage recommendation
    // has been computed and an explicitly simulated settings acknowledgment.
    // No OpenClaw Gateway or provider is invoked.
    const observed: string[] = [];
    let current = sol;
    async function fakeRequest(): Promise<void> {
      observed.push(`dispatch:${current.model}`);
    }
    async function completedStage(nextObjective: string): Promise<void> {
      observed.push("tools:settled");
      const proposal = proposeStageRoute(stage({
        currentModel: current,
        boundary: { responseCompleted: true, toolsSettled: true, objectiveChanged: true, nextObjective },
      }), DEFAULT_PLUGIN_CONFIG);
      if (proposal.shouldRequestChange) {
        observed.push(`settings:ack:${proposal.proposedModel.model}`);
        current = proposal.proposedModel;
      }
      await fakeRequest();
    }
    await fakeRequest();
    await completedStage(routineObjective);
    await completedStage(difficultObjective);
    expect(observed).toEqual([
      "dispatch:gpt-6-sol",
      "tools:settled", "settings:ack:gpt-6-luna", "dispatch:gpt-6-luna",
      "tools:settled", "settings:ack:gpt-6-sol", "dispatch:gpt-6-sol",
    ]);
  });
});
