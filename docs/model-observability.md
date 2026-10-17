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

## Owner-side turn-level accounting and aggregate checks

**Issue #7 owner decision, 2026-10-17:** the owner reports that their OpenAI logs can provide **turn-level model accounting**. This is a separately assessed external verification source, not a requirement to retrofit native Codex provider-call receipts for functional acceptance.

For a bounded test, retain only sanitized test timestamps, the OpenClaw run/session correlation that is already available, router mode/manual-lock/applied/model fields and completed-turn status. The owner can then compare their OpenAI model-accounting records:

- **When an OpenAI record can genuinely be associated with an individual completed turn**, record the independently observed model for that turn and note how the association was established. Treat this as turn-level accounting, not proof of every hidden Codex retry or request.
- **When the data is only grouped by model/time window**, report it as an aggregate cross-check; do not assert exact per-run correlation.
- Where the owner has not yet inspected the records, mark external verification **pending**, not failed or passed. Any later mismatch requires follow-up.

Never copy provider request identifiers, raw prompts, responses, private session keys or credentials into the router audit or GitHub evidence.

## Issue #7: two-track acceptance policy

**Functional acceptance may proceed using OpenClaw's own model-selection state, scoped manual override, router decisions and confirmed completed turns.** Provider-model identity from OpenAI accounting is deferred to an independent owner-run check and does not block that functional gate. Native `model.call.completed`, `selectionReceipt` and per-provider-call receipts are valuable optional observations, but their absence is not a standalone failure of the Issue #7 functional test. Do not label selected-only evidence as provider-verified.

This acceptance-policy change does not remove the runtime telemetry facilities developed under Issue #2, change the router's routing policy, or waive manual-precedence, fail-closed session scope, isolation and shadow/off restoration controls. See [the updated canonical acceptance protocol](acceptance-test-protocol.md).

## Accepted native limitation

Native Codex does not currently expose a supported provider-call event with an identity for every hidden request, retry, or fallback. The router records the strongest supported `runtime-model` evidence and documents its turn/run scope instead of fabricating stronger semantics. This is an accepted Issue #2 limitation, not a blocker or a reason to alter routing policy; AUTO remains governed by its separate safety and manual-selection gates.
