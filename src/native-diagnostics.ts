import { onInternalDiagnosticEvent } from "openclaw/plugin-sdk/diagnostic-runtime";
import type {
  DiagnosticEventMetadata,
  DiagnosticEventPayload,
} from "openclaw/plugin-sdk/diagnostic-runtime";
import type { NativeModelCallDiagnosticEvent } from "./telemetry.js";

const NATIVE_MODEL_CALL_TYPES = [
  "model.call.started",
  "model.call.completed",
  "model.call.error",
] as const;

type DiagnosticModelCallEvent =
  | (Extract<DiagnosticEventPayload, { type: "model.call.started" }> & {
    observationUnit: "turn";
  })
  | (Extract<DiagnosticEventPayload, { type: "model.call.completed" }> & {
    observationUnit: "turn";
  })
  | (Extract<DiagnosticEventPayload, { type: "model.call.error" }> & {
    observationUnit: "turn";
  });

function isDiagnosticModelCallEvent(
  event: DiagnosticEventPayload,
  metadata: DiagnosticEventMetadata,
): event is DiagnosticModelCallEvent {
  if (metadata.trusted !== true) return false;
  if (!(NATIVE_MODEL_CALL_TYPES as readonly string[]).includes(event.type)) return false;
  const candidate = event as Extract<
    DiagnosticEventPayload,
    { type: (typeof NATIVE_MODEL_CALL_TYPES)[number] }
  >;
  return candidate.observationUnit === "turn"
    && typeof candidate.runId === "string"
    && candidate.runId.length > 0
    && typeof candidate.callId === "string"
    && candidate.callId.length > 0
    && typeof candidate.provider === "string"
    && candidate.provider.length > 0
    && typeof candidate.model === "string"
    && candidate.model.length > 0;
}

/**
 * Subscribes to the installed OpenClaw native-harness diagnostic surface.
 * The listener receives no private model-content payload, and only turn-level
 * events are forwarded because they are not provider-request observations.
 */
export function onNativeModelCallDiagnostic(
  handler: (event: NativeModelCallDiagnosticEvent) => void,
): () => void {
  return onInternalDiagnosticEvent((event, metadata) => {
    if (!isDiagnosticModelCallEvent(event, metadata)) return;
    handler(event);
  }, {
    include: NATIVE_MODEL_CALL_TYPES,
    includeTrusted: NATIVE_MODEL_CALL_TYPES,
  });
}
