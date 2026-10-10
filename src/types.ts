import type { Tier } from "@blockrun/router-core";
import type { LocalClassification } from "./classifier.js";

export type RouterMode = "off" | "shadow" | "auto";
export type RouterTier = Tier;

export type ModelTarget = {
  provider: string;
  model: string;
};

export type RouterPluginConfig = {
  mode: RouterMode;
  ambiguousTier: RouterTier;
  protectManualSelection: boolean;
  requireSessionKeyForAuto: boolean;
  minAttachmentTier: RouterTier;
  models: Record<RouterTier, ModelTarget>;
};

export type RouteWorkInput = {
  prompt: string;
  attachmentCount?: number;
  classification?: LocalClassification;
};

export type RouteWorkDecision = {
  classifierTier: RouterTier | null;
  effectiveTier: RouterTier;
  confidence: number;
  score: number;
  signals: string[];
  target: ModelTarget;
  reason: string;
};

export type ManualModelLock = {
  provider?: string;
  model?: string;
  sessionId?: string;
  updatedAt: number;
};
