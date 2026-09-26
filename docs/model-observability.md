# Effective-model observability (OpenClaw 2026.9.6)

Issue [#2](https://github.com/danceoflogic/openclaw-deterministic-router/issues/2) uses the strongest supported evidence available on each runtime path. It keeps the router's selected target separate from the model identity reported by OpenClaw, without requiring native Codex to expose provider-request telemetry that it does not guarantee.

## Evidence levels

Every emitted decision or model observation carries an explicit `verificationLevel`:

- `selected-only`: the router recorded its selected provider/model, but no independent runtime identity is attached to that record.
- `provider-call`: OpenClaw's embedded `model_call_started` / `model_call_ended` event reports provider/model metadata at `runId` + `callId` scope.
- `runtime-model`: a supported native runtime observation reports model identity for a run or opaque turn, without claiming provider-request or per-retry semantics.

## Implemented telemetry

- Embedded `model_call_started` and `model_call_ended` events record sanitized `effectiveProvider`/`effectiveModel` separately from the selected target. Correlation uses `runId` and retains each `callId`; the decision is snapshotted at call start so later decisions cannot relabel an earlier call.
- Router audit decisions are `selected-only` records. This remains true even when a later provider-call or runtime-model observation provides independent evidence.
- `agent_end` context can provide a run-scoped `model_identity_observed` record with `verificationLevel: "runtime-model"`, `source: "agent_end_context"`, and `resolvedProvider`/`resolvedModel`. It has no `callId` and is not a provider-call event.
- The installed OpenClaw 2026.9.6 Codex bundle also emits trusted `model.call.started` / `model.call.completed` / `model.call.error` diagnostics. When `observationUnit: "turn"`, the router records them as `runtime-model` observations with `source: "diagnostic_model_call"`, turn scope, the selected decision snapshot, and sanitized `api`/`transport` metadata.
- Codex's installed emitter uses a synthetic turn identifier such as `<runId>:codex-model:1`; it is not an upstream provider request ID. The corresponding lifecycle covers one opaque app-server turn that may contain hidden provider requests, retries, tool work, or background work.

## Runtime contract

The OpenClaw 2026.9.6 provider-call hook contract (`docs/plugins/hooks/prompt-and-session.md`, “Debug runtime hooks”) limits `model_call_started` / `model_call_ended` emission to the embedded model-call path. Its Codex v1 support contract (`docs/plugins/codex-harness-runtime/v1-support-contract.md`) lists `llm_input`, `llm_output`, and `agent_end` as adapter-level lifecycle observations. The Codex hook boundary (`docs/plugins/codex-harness-runtime/hooks.md`) says those projections come from app-server notifications and adapter state, not byte-for-byte captures of Codex's internal model request.

| Runtime path | Current evidence | Guarantee |
| --- | --- | --- |
| Embedded model-call path | Documented `model_call_*` provider-call events | A received event reports effective provider/model at `runId` + `callId` granularity. |
| Native Codex app-server path | Adapter lifecycle observations plus trusted turn-scoped `model.call.*` diagnostics | Separately labelled run/turn model identity and lifecycle correlation. No claim is made about each hidden provider request, retry, or fallback. |

`agent_end`, `llm_input` / `llm_output`, and native turn diagnostics must not be relabelled as provider-call events or assigned fabricated provider-request semantics. Native diagnostic `callId` is retained only as a turn-scoped synthetic identifier. Raw prompts, responses, headers, credentials, raw session keys, and raw provider request IDs are not logged.

## Aggregate external sanity check

For a controlled acceptance run, OpenAI account/model usage can provide an independent aggregate cross-check:

1. Choose a short, isolated test window and a small known prompt set.
2. Record router decisions, timestamps, selected provider/model, and emitted verification levels.
3. Inspect OpenAI usage for the same window by model.
4. Confirm that aggregate usage is consistent with the routed workload and investigate obvious drift, such as a Luna-heavy run unexpectedly consuming Sol.

Usage data is aggregate evidence only. It is not exact per-`runId` or per-`callId` correlation and must not be presented as provider-call proof for an individual turn.

## Accepted native limitation

Native Codex does not currently expose a supported provider-call event with an identity for every hidden request, retry, or fallback. The router records the strongest supported `runtime-model` evidence and documents its turn/run scope instead of fabricating stronger semantics. This is an accepted Issue #2 limitation, not a blocker or a reason to alter routing policy; AUTO remains governed by its separate safety and manual-selection gates.
