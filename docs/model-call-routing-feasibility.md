# Experimental mid-turn stage routing (per-request optimisation later)

**Status:** proposal, updated 18 October 2026. [Issue #42](https://github.com/danceoflogic/openclaw-deterministic-router/issues/42) is the canonical tracker. No plugin/runtime source, production/TEST configuration, authorisations or inference calls are changed or approved here.

**Installed-version follow-up:** [The 0.160.0 investigation and installed-binary offline test](stage-routing-prototype.md#installed-runtime-investigation-18-october-2026) independently verify that `turn/settings/update` works within an active turn, but find no awaited post-tools/pre-capture routing callback. Real-model switching remains unverified; the current integration decision is NO-GO without that protocol/adapter extension.

## User-observed stages and the actual boundary

The operator observes a sequence of tool calls, visible progress feedback, and then another sequence of tool calls during long Codex tasks. That suggests **mid-turn stage routing** may offer useful cost/quality improvements without making independent decisions on every hidden provider request.

**Visible progress text is not a formal "review point".** It may be streamed mid-response or at various times. The **safe candidate boundary** is when a model response and its tool work are complete, *before* Codex captures the next follow-up step/model context and dispatches another inference request. Do not interrupt streaming text or switch between multiple tools generated in the same response.

Codex upstream's `run_turn` loop has repeated `run_sampling_request` calls. Its current `StepContext` documentation calls out immutable request-scoped settings captured before request preparation. The user-supplied Sol High investigation located that seam in local `turn.rs`/`turn_context.rs`, but also reported that the **installed OpenClaw adapter lacks an in-progress model-selection handoff**: `before_model_resolve` is turn-scoped and `turn/steer` sends input, not a new model. **This is an operator-reported installed-runtime finding**, not an independent live inspection by this documentation change.

Upstream Codex also documents experimental `turn/settings/update` guarded by `step_model_switching`; it can affect *later captured steps* in eligible builds. An RPC applied sometime during an active turn does **not** by itself provide deterministic control of the **next** step. Never implement a racy log listener or approximate delay to guess the boundary.

Source references: [Codex run loop](https://github.com/openai/codex/blob/main/codex-rs/core/src/session/turn.rs), [StepContext](https://github.com/openai/codex/blob/main/codex-rs/core/src/session/step_context.rs), [experimental app-server method](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md). These links follow upstream `main`; always validate exact installed versions before making a compatibility claim.

## Minimum viable design

```text
OpenClaw initial agent turn
    → existing original-model selection (unchanged)
    → Codex performs a response plus its tool batch
    → tools have settled; a follow-up step is about to be captured
    → [optional synchronised stage-router decision]
         original task + original selected model + current model
         + bounded new stage signals + existing authorisation/policy
    → keep selected model OR apply validated change
    → Codex builds next step and continues (no interruption)
```

The first milestone is **stage routing**, not unbounded call-by-call optimisation. The technical seam may be near individual sampling requests; this does **not** imply the policy must classify or switch on every one. It may simply retain the current model for ordinary continuation, only reconsidering it when a completed work stage supplies meaningful new evidence.

Design invariants:

- **Original-model preservation:** "Preserve the original chosen model for difficult tasks rather than aggressively downgrading." This is a model-agnostic rule, not a Sol preference. User/manual model selection is authoritative and must not be overwritten.
- **Cheap decision:** reuse the existing local no-inference classifier and model policy, without a second classifier, external service, full-transcript reclassification on each tool step or expensive blocking logic. Preserve a small task/continuation state, especially for terse tool outputs.
- **Fail safely:** separate experimental `off` (default), optional `shadow`, and explicitly scoped `auto`, without changing the existing agent-turn modes. Unknown authority, rejected setting, lost callback or timeout retain the last **authorised** model. The host controls retries/fallbacks and must not be accidentally re-routed.
- **Compatibility:** model-specific instructions, active tools and permissions, provider/auth, reasoning state, compaction and context continuity need compatible target models. Prefer switching within a verified provider/auth connection first.
- **No artificial switch quota:** use a meaningful stage-change criterion and cost/quality threshold, not a rigid one-switch limit. Returning to the original model is legitimate.
- **Truthful telemetry:** separate `stage-decision`, requested/applied settings update, captured/dispatched model and confirmed provider request if available. Do not infer hidden provider requests from synthetic turn diagnostics. No raw user prompts, outputs, session keys or secrets in logs.

## Cache-aware switching is a hypothesis, not an assumption

Model A → B → A might retain two **separate model-specific cached prefixes**. When A is revisited, an unchanged prefix might be cached and only a newer suffix needs full processing. This depends on rendering the same prefix, provider placement, model-specific instructions/tool schemas, cache retention and usage eligibility. Cache material is **not transferred** across models; a hit is never guaranteed. Avoid speculative cache prewarming.

Assess overall task cost, not cheapest next request: fresh/cached input and output tokens, provider-reported cache usage or billing, retries, repair work and latency. Observe actual behaviour before introducing cache-specific switching policy. References: [OpenAI prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching).

## Three small milestones

**M0 · Check the real seam (offline/read-only).** Confirm exact installed OpenClaw/Codex versions and feature flags. Trace tool-completion → update/acknowledgment → immutable step snapshot → dispatch. Establish whether a supported synchronous mechanism exists. If not, specify one **small protocol+adapter callback** at the follow-up step boundary, with bounded timeout. Avoid a Codex fork, polling service and extra infrastructure by default. Record GO/NO-GO before coding.

**M1 · Feature-gated offline prototype.** If feasible, exercise one staged sequence with fake responses: A initially → completed tool stage → B for new straightforward work → completed stage → A as difficult work resumes. Verify timing/authority, continuity, no switching inside one response, no per-tool routing, fallback on timeout and valid effective-model evidence. Keep current agent-turn regression coverage intact.

**M2 · Real-work evaluation by separate approval.** Compare ordinary turn routing and stage routing on real tasks: quality, net cost, independently measured per-model cache hits, avoidable repair/retries, p50/p95 routing latency and model switches. Expand toward more granular model-call optimisation **only if the measured benefit warrants it**.

## Scope

This is an **experimental component of the existing repository**. It does not reopen accepted Issue #8 child-routing tests or grant blanket production AUTO. Keep the work consistent with [ADR 0002](decisions/0002-routing-boundaries-and-evaluation.md), [#9 cost/quality](https://github.com/danceoflogic/openclaw-deterministic-router/issues/9), [#12 compatibility](https://github.com/danceoflogic/openclaw-deterministic-router/issues/12) and [#35 thinking-effort](https://github.com/danceoflogic/openclaw-deterministic-router/issues/35).
