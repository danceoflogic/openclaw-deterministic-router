import { maxTier } from "./policy.js";
import { routeWork } from "./route-work.js";
import type { ModelTarget, RouterPluginConfig, RouterTier } from "./types.js";

/**
 * Pure proposal at a Codex follow-up sampling boundary.
 * This function never dispatches or changes a model.
 * The opt-in runtime adapter MUST verify the boundary, persisted manual state,
 * authority, model eligibility, and applied settings independently.
 */
export type StageBoundary = {
  /** A completed model response is required; progress commentary is not a boundary. */
  responseCompleted: boolean;
  /** All tools from that response have settled; an individual tool result is not enough. */
  toolsSettled: boolean;
  /** True only when a trusted stage owner explicitly establishes a new objective. */
  objectiveChanged: boolean;
  /** The next stage's short objective, NOT a copy of the full transcript or last tool output. */
  nextObjective?: string;
};

export type StageRouteInput = {
  /** Must be enabled explicitly by the caller; disabled by default. */
  experimentalEnabled?: boolean;
  /** Only authoritative host reconciliation may mark manual state clear. */
  manualSelectionState: "clear" | "manual" | "unknown";
  /** The original task's classification, fixed at turn start. */
  originalTier: RouterTier;
  /** The originally selected model, with no model-family privilege. */
  originalModel: ModelTarget;
  /** The model currently authorised for this ongoing turn. */
  currentModel: ModelTarget;
  /** Trusted, capability-compatible candidate models; an empty list prevents changes. */
  eligibleModels: readonly ModelTarget[];
  boundary: StageBoundary;
};

export type StageRouteProposal = {
  /** Classification of confirmed next-stage work, if evaluated. */
  nextTier: RouterTier | null;
  /** Candidate recommendation only, not verified actual provider/request identity. */
  proposedModel: ModelTarget;
  /** True only when an adapter could REQUEST a change after all guards. */
  shouldRequestChange: boolean;
  reason: string;
};

function sameModel(a: ModelTarget, b: ModelTarget): boolean {
  return a.provider === b.provider && a.model === b.model;
}

function keep(input: StageRouteInput, reason: string): StageRouteProposal {
  return {
    nextTier: null,
    proposedModel: input.currentModel,
    shouldRequestChange: false,
    reason,
  };
}

/**
 * Run once at a trusted, completed work-stage transition. The caller must not
 * use a streamed progress message or a partial tool result to invoke it.
 */
export function proposeStageRoute(
  input: StageRouteInput,
  config: RouterPluginConfig,
): StageRouteProposal {
  if (input.experimentalEnabled !== true) {
    return keep(input, "experimental stage routing disabled");
  }
  if (input.manualSelectionState !== "clear") {
    return keep(input, "manual selection or unknown persisted state; preserve current model");
  }
  if (!input.boundary.responseCompleted || !input.boundary.toolsSettled) {
    return keep(input, "model response or tool batch still active");
  }
  if (!input.boundary.objectiveChanged) {
    return keep(input, "no independently confirmed change in stage objective");
  }
  const objective = input.boundary.nextObjective?.trim() ?? "";
  // Limit classifier work to a small, explicit stage goal, not the full conversation.
  if (objective.length < 4 || objective.length > 8192) {
    return keep(input, "no bounded next-stage objective available");
  }

  const classification = routeWork({ prompt: objective }, config);
  const nextTier = classification.effectiveTier;

  // Preserve the original chosen model for difficult continuations rather
  // than automatically demoting it to a policy default (which could be Sol).
  // Stronger newly discovered work may still use the configured eligible tier.
  const continuationWithinOriginalDifficulty =
    (input.originalTier === "COMPLEX" || input.originalTier === "REASONING")
    && (nextTier === "COMPLEX" || nextTier === "REASONING")
    && maxTier(input.originalTier, nextTier) === input.originalTier;
  const candidate = continuationWithinOriginalDifficulty
    ? input.originalModel
    : classification.target;

  // No model/provider changes across an unverified compatibility boundary.
  if (candidate.provider !== input.currentModel.provider) {
    return keep(input, "different provider; compatibility not verified");
  }
  if (!input.eligibleModels.some((model) => sameModel(model, candidate))) {
    return keep(input, "target is not explicitly capability eligible");
  }

  return {
    nextTier,
    proposedModel: candidate,
    shouldRequestChange: !sameModel(candidate, input.currentModel),
    reason: continuationWithinOriginalDifficulty
      ? "difficult continuation; preserve originally selected model"
      : `confirmed new stage classified as ${nextTier}; compatible target`,
  };
}
