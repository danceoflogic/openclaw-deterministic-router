# Effective-model observability (OpenClaw 2026.9.6)

Issue [#2](https://github.com/danceoflogic/openclaw-deterministic-router/issues/2) requires independent evidence of the provider/model **actually called** for every routed live call. The router's `before_model_resolve` decision records a *selected* target; in `shadow` mode that target is hypothetical, and in `auto` mode applying an override still does not prove which model handled inference.

## What PR #15 establishes

- `model_call_started` and `model_call_ended` supply sanitized `provider`/`model` metadata for an embedded OpenClaw provider call. The router logs these as `effectiveProvider`/`effectiveModel`, separately from the selected target.
- Correlation uses `runId` and preserves each `callId`. The selected decision is snapshotted at call start, so a later decision cannot relabel an earlier call; retries and multiple calls are not collapsed into one run-level result.
- `agent_end` marks the run terminal for bounded correlation-state cleanup. When its adapter context supplies `modelProviderId`/`modelId`, the router records those as a run-scoped `model_identity_observed` signal with `source: "agent_end_context"` and `resolvedProvider`/`resolvedModel`. This is not a provider-call event and supplies no `callId` or independent effective-model guarantee.
- Native Codex `llm_output` observations are compatible with the same weaker identity distinction when emitted; they must use `observationScope: "attempt"` and `source: "llm_output"`, not `effective*` labels.
- Unit tests exercise synthetic call events and lifecycle ordering. The OpenClaw 2026.9.6 runtime-loader smoke test verifies hook **registration**, not that a native Codex run emits those hooks or reaches a particular provider/model.

The provider-call hook contract in OpenClaw 2026.9.6 (`docs/plugins/hooks/prompt-and-session.md`, “Debug runtime hooks”) explicitly limits `model_call_started` / `model_call_ended` emission to the **embedded model-call path**. Its Codex v1 support contract (`docs/plugins/codex-harness-runtime/v1-support-contract.md`) lists `llm_input`, `llm_output`, and `agent_end` as adapter-level lifecycle observations. The Codex hook boundary (`docs/plugins/codex-harness-runtime/hooks.md`) says those LLM projections come from app-server notifications and adapter state, not byte-for-byte captures of Codex's internal model request.

| Runtime path | Current evidence | Guarantee from PR #15 |
| --- | --- | --- |
| Embedded model-call path | Documented `model_call_*` provider-call events; correlation and registration tests | A received call event reports effective provider/model at `runId` + `callId` granularity. Live end-to-end coverage still needs validation on the target host. |
| Native Codex app-server path | Adapter lifecycle observations, including `agent_end`; no documented `model_call_*` emission | At most a separately labelled resolved run/model identity from adapter-visible context. PR #15 does **not** independently verify the provider/model Codex actually called. |

`agent_end` context and `llm_input` / `llm_output` must not be relabelled as provider-call events or assigned fabricated `callId` semantics. The router uses `model_identity_observed` with `resolved*` fields for those weaker signals. Even if an adapter observation reports a model name, that establishes only the identity guaranteed by that adapter event, not a completed provider call or every native retry/fallback.

## Open acceptance gate

Issue #2 is **not complete for native Codex**. Before closing it or enabling `auto` on Codex-backed targets:

1. Identify a supported native-Codex observation that independently reports the actual provider/model per call (including retries/fallbacks), or obtain an explicit OpenClaw/Codex provider-call event with that guarantee. If only resolved-run identity is exposed, record it as a weaker, separately labelled signal and keep the effective-call criterion open.
2. Correlate the observed call with the router decision without overwriting multiple calls in one run; prove `shadow` and `auto` comparisons for the supported runtime paths.
3. Add regression/integration evidence for the chosen path and verify a real Codex-backed run. Hook registration alone is insufficient.
4. Keep telemetry metadata-only: no prompts, responses, headers, credentials, raw session keys, or raw provider request IDs. Do not change routing policy to solve an observability gap.

The existing embedded-path correlation remains useful, but it cannot be used as evidence that native Codex's actual provider calls were observed.
