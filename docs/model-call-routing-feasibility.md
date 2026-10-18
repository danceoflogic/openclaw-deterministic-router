# Experimental model-call routing: feasibility and minimal design

**Status:** proposal only, 18 October 2026. Tracked in [Issue #42](https://github.com/danceoflogic/openclaw-deterministic-router/issues/42). No code, production settings, permissions, or live Gateway operations are authorised by this note.

## Goal and boundary

Add an **optional** decision at individual inference-request boundaries during a Codex-driven OpenClaw turn while retaining the proven `before_model_resolve` **agent-turn** router. Both granularities should reuse the **same deterministic, no-LLM classification and policy engine** rather than growing two routers.

**Correct policy wording:** *Preserve the original chosen model for difficult tasks rather than aggressively downgrading.* The model can be anything the operator selected or policy permits; it is not a Sol-specific rule. Explicit manual selection wins. The existing manual/session identity checks and host's recovery ownership stay intact.

A successful Issue #8 native `sessions_spawn` child test proves **agent-turn routing**, *not* each hidden Codex sampling request. Do not recharacterise that evidence.

## Discover the supported host control point first

Codex upstream exposes an **experimental** app-server `turn/settings/update` surface and underlying `TurnSettingsUpdate` structure, including model changes for subsequent steps. This **does not prove** that the user's installed version supports it or that an OpenClaw plugin can reliably interpose a decision **before** each request; asynchronous event handling could race the next sample.

1. Identify exact running OpenClaw and bundled Codex versions and flags, then inspect their version-matched protocol definitions and app-server client path.
2. Trace the **actual** timeline: tool result → scheduling the next sample → accepting a settings update → capturing request model → dispatch. Determine whether an existing synchronised point is available and whether child/managed-policy checks block updates.
3. Inspect changes in model-specific instructions, supported tools, reasoning settings, compaction state, request cache/state, active streams and host retry/fallback behaviour. A successful settings RPC alone is not evidence that every request can be routed.
4. **Go/no-go:** if there is no deterministic supported boundary, document the limitation. Only then consider proposing a tiny upstream hook. No timer, log-watching race, subprocess per decision, sidecar server, or local Codex fork as the default plan.

Source references: [app-server method declaration](https://github.com/openai/codex/blob/main/codex-rs/app-server-protocol/src/protocol/common.rs), [turn settings type](https://github.com/openai/codex/blob/main/codex-rs/protocol/src/protocol.rs). These links are to upstream `main` and **must be checked at the installed version** before implementation.

## Minimal candidate flow (conditional on feasibility)

```text
OpenClaw turn (existing model selection)
    → Codex step ready for another inference request
    → synchronised supported decision point
    → enforce manual/session authority and model capabilities
    → reuse local classifier + original task and minimal step signals
    → keep original/current model OR publish permitted model update
    → Codex builds and dispatches request; observe actual model if exposed
```

- **No new classifier or inference call.** A light in-process lookup should be the common case; measure p50/p95 overhead before expanding. Never synchronously parse the full transcript every step.
- **Small bounded task context.** Retain initial task tier, original model, current model, and only necessary tool-step signals. A short success/error message is insufficient on its own to downgrade difficult ongoing work.
- **Safe defaults.** Separate feature flag and `off`/`shadow`/`auto` controls for this extension. Initially disabled. `auto` must be explicitly scoped; unknown authorization fails closed. Unsupported switch, timeout or error **retains the already-authorized model**.
- **Capability and continuity.** Only switch among targets verified compatible with current tools, context, authentication, provider and model-specific instructions. Respect original manual choice. Do not alter retry/fallback attempts merely because they trigger additional hooks.
- **No arbitrary switching limit.** Avoid oscillation with a cost/benefit threshold or minimum evidence, but do not ban returning to a previous model without data.

## Prompt-cache hypothesis and costs

Model A and Model B can each potentially develop **their own** cached prompt prefixes. Sequence A → B → A could reuse A's earlier unchanged prefix and process new suffix content. This is **not** KV sharing or transfer across models and **not guaranteed** to hit.

A cache hit depends on exact rendered prefix, model-specific instructions/tools/format, eligible prefix length, lifespan, backend routing and request options. Returning to a model may still cost substantial uncached/cache-write tokens. Reuse must be **observed** through provider-reported cached-token and cache-write usage (where available), not inferred from model identity or elapsed time. Do not prewarm caches automatically in v1.

Compare *total billed task cost*: cache reads/writes, input/output tokens, retries and repair work. Also compare completion quality and elapsed time. A cheaper individual call can increase overall cost.

Reference: [OpenAI prompt-caching guide](https://developers.openai.com/api/docs/guides/prompt-caching) and [cache diagnostics](https://developers.openai.com/api/docs/guides/prompt-caching/diagnostics). Model-specific policies/rates can change; use measured response usage and current published prices, not hard-coded historical assumptions.

## Evidence, privacy and evaluation

Emit minimal non-content-bearing records for **trusted** observations only: decision and requested model, observed dispatched/effective model if exposed, run/turn and true call ID, routing latency, retry marker if known, and provider usage/cache numbers when available. Preserve evidence-scope labels: an OpenClaw `runtime-model` turn observation must **not** be advertised as provider-request proof. Do not log prompts, tool outputs, credentials or full session keys.

**M0 feasibility, offline/read-only:** version-matched protocol and scheduling report with supported/unsupported verdict; no live inference.

**M1 bounded prototype, offline:** one small conditional integration; fake-provider sequence A → B → A; tests for manual lock, original-model/task preservation, unsupported targets, model-specific context/compaction, error/timeout handling, host retry precedence and accurate event semantics. Baseline tests unchanged.

**M2 opt-in field comparison, separately approved:** measure ordinary turn routing against optional per-call routing on a small sample of actual tasks. Record quality, net cost, cache hit/read/write volume, repair/retry count and p50/p95 routing latency. Ship only if benefits justify maintenance and reliability risk.

## Scope and relation to other work

This lives **inside the existing repository** as an experimental extension; no second orchestration project. Keep the current production/TEST bundles unchanged. [Issue #35](https://github.com/danceoflogic/openclaw-deterministic-router/issues/35) (per-tier thinking effort), [#9](https://github.com/danceoflogic/openclaw-deterministic-router/issues/9) (evaluation) and [#12](https://github.com/danceoflogic/openclaw-deterministic-router/issues/12) (compatibility) are related but separate. Follow the existing [ADR 0002](decisions/0002-routing-boundaries-and-evaluation.md) for authority, fallback and evidence boundaries.
