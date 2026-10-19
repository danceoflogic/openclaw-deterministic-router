import { proposeStageRoute } from "./stage-routing.js";
import type { ModelTarget, RouterPluginConfig, RouterTier } from "./types.js";

/** Experimental, process-local bridge installed only by an explicitly opted-in host. */
export const CODEX_STAGE_ROUTER = Symbol.for("openclaw.deterministic-router.stage.v1");

export type StageRouterStart = {
  runId: string;
  sessionKey: string;
  agentId: string;
  originalModel: ModelTarget;
};

export function createStageRoutingSession(input: {
  config: RouterPluginConfig;
  originalTier: RouterTier;
  originalModel: ModelTarget;
  readManualState: () => "clear" | "manual" | "unknown";
  audit?: (record: Record<string, unknown>) => void;
}) {
  let lastObjective: string | undefined;
  const eligibleModels = [...Object.values(input.config.models), input.originalModel];
  return (boundary: { model: string; nextObjective?: string | null }): { model?: string } => {
    const objective = boundary.nextObjective?.trim();
    // A native accepted plan is the stage signal. Commentary and individual
    // tool outputs never establish a new objective. Classify each change once.
    if (!objective || objective === lastObjective) return {};
    lastObjective = objective;
    const started = performance.now();
    const proposal = proposeStageRoute({
      experimentalEnabled: true,
      manualSelectionState: input.readManualState(),
      originalTier: input.originalTier,
      originalModel: input.originalModel,
      currentModel: { provider: input.originalModel.provider, model: boundary.model },
      eligibleModels,
      boundary: { responseCompleted: true, toolsSettled: true, objectiveChanged: true, nextObjective: objective },
    }, input.config);
    input.audit?.({ event: "stage.route", currentModel: boundary.model,
      proposedModel: proposal.proposedModel.model, requestedChange: proposal.shouldRequestChange,
      reason: proposal.reason, durationMs: performance.now() - started });
    return proposal.shouldRequestChange ? { model: proposal.proposedModel.model } : {};
  };
}
