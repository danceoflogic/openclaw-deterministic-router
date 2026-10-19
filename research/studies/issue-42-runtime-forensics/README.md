# Issue #42 research: full OpenClaw/Codex turn forensics

**Status:** Research plan recorded 19 October 2026. Full instrumented investigation **not yet performed** by this document.

**Related:** [Issue #42](https://github.com/danceoflogic/openclaw-deterministic-router/issues/42), [draft PR #47](https://github.com/danceoflogic/openclaw-deterministic-router/pull/47), [stage-routing prototype](../../../docs/stage-routing-prototype.md), [preliminary benchmark observations](2026-10-19-preliminary-results.md).

## Primary question

**Does automatic reasoning-effort adaptation on `gpt-6.1-sol` reduce total resources per correctly completed task?** Establish why cache reuse, inference count and elapsed time differ between fixed-High and adaptive High/Low executions.

Do not fix individual symptoms first. Build a **correlated, chronological explanation of the whole turn**, from OpenClaw admission to native Codex request construction, real provider responses, tool work and subsequent inference.

### Scope and boundaries

- **Model:** `gpt-6.1-sol` only, for both benchmark configurations.
- **Comparison A:** fixed High effort.
- **Comparison B:** stage-driven High/Low effort using the existing deterministic classifier and synchronous callback.
- Use the existing isolated `router-test` Gateway and experimental OpenClaw 2026.10.4 / Codex 0.160.0 integration; confirm actual builds at run time.
- Keep classifier, stage detection, prompting and security policy **unchanged** while gathering evidence.
- No live tests on production; no changes to `main`; PR #47 stays **draft and unmerged** until separately authorized.
- Preserve manual choices, session authorization, native model/effort compatibility and native tool ownership. Restore TEST configuration, build and managed executable exactly after diagnostic runs.
- Diagnostics/instrumentation off by default. Do not log credentials, raw prompts, private context or auth headers to the repository.

## Existing starting evidence

See [the 19 October preliminary record](2026-10-19-preliminary-results.md). One user-supplied native-usage extraction found 7 fixed-High requests and 8 adaptive requests. Fixed High had 31,442 uncached input tokens; adaptive had 83,895. The adaptive Low request and an earlier High request both had zero cache hits. The latter precedes any effort change, so **effort switching is not a sufficient explanation for all losses**. The script could not match native turns to completed-run metadata; provenance must be reconciled before treating this as a definitive benchmark.

A separate earlier real-provider effort-switch demonstration showed `high, high, low, high, high` in one turn; its five requests and cache observations are documented in [the effort evidence](../../../experimental/issue42-effort-live-result.json). It proved the switching seam, **not savings or cache causality**.

## Investigation work

### 1. Recover and correlate existing evidence

Recover prior Issue #42 benchmark and stage-routing data, especially the private TEST directory:

```text
~/.openclaw-router-test/issue42-benchmark-b0c7f27b7d
```

Identify each run, model, effort, start/end time, native turn, response ID, stage event and tool receipt. Reconcile the shell extract's `UNMATCHED` labels with benchmark task metadata. Separate completed, aborted, retried and discarded turns. Investigate the previously reported unmatched `tool.call` / `tool.result` incident and whether it affected telemetry completeness.

Do not rerun already completed acceptance tests to replace existing evidence.

### 2. Map and instrument the full lifecycle

Trace:

```text
OpenClaw ingress/admission
  -> session, permissions and manual defaults
  -> local classifier / staged goal
  -> awaited native turn/stageRouting handoff
  -> native settings publication
  -> Codex tool batch and next-step context snapshot
  -> assembled Responses request (post-admission)
  -> provider response and usage
  -> tool invocation/result reconciliation
  -> conversation append / replay / possible compaction
  -> following inference or final turn completion
```

Collect the richest **supported** read-only signals first (source inspection, existing native instrumentation, Gateway logs, usage and official API diagnostics). Add temporary TEST-only, low-overhead trace hooks only for gaps; verify instrumentation does not itself disturb prompts/caching. Prefer one shared timeline per turn with monotonic timestamps and stable correlation IDs.

For **each inference request**, record the following when observable:

| Domain | Fields |
| --- | --- |
| Identity | study/task/run, OpenClaw session/run, native thread/turn, provider response ID, request ordinal, runtime/build and transport |
| Routing | accepted plan-stage goal (safe structured descriptor), tier, decision reason, previous/target model and effort, manual/authorization guard, requested vs actually applied setting and elapsed time |
| Native request | post-admission model and `reasoning.effort`, generation settings, service tier, cache key presence + safe stable fingerprint, tool definitions/order, feature flags, retry/fallback status |
| Context | token/byte size and message/item counts, canonical **private** prefix-diff location, safe instruction/tool/prefix fingerprints, append/rewrite/truncation, tool receipts, compaction and `configuration_update` items |
| Provider | request start, first response, completion, provider-reported model/tier when available, response status, input/cached/uncached tokens, output tokens, reasoning-token subset, any **measured** cache writes or provider cache diagnostics |
| Execution | tool begin/end, retries, failures and repair calls, router CPU time, native handoff time, network/wait/inference time, wall-clock turn and successful task completion |

Keep original wire/request comparisons private; publish only safe metadata and reviewed aggregates. Avoid plain hashes of short/guessable sensitive content.

### 3. Diagnose every major cache event, not just the Low transition

For each consecutive request pair:
1. Locate the **earliest divergence** in the assembled request prefix and its provenance (system/developer content, tool schemas/order, history, configuration, hidden/native model instructions, service tier, effort, cache key, transport or replay).
2. Determine if a cache hit was possible (length, prefix eligibility, provider availability/eviction and timing), and compare the **same mechanism** in fixed High.
3. Separate **structural request changes** from cache-infrastructure variability and normal differences in model decisions.
4. Verify whether a `reasoning.effort` top-level change alters prefix identity on the actual Codex route. Evaluate an appended `configuration_update` only as a **hypothesis/alternative**, subject to support in the actual auth route and native runtime; do not implement it during this investigation.
5. If official `comparison_response_id` or prompt-cache diagnostic endpoints exist, verify availability and permissions for the **actual ChatGPT OAuth Codex route** before using them. Do not assume Platform API features or pricing apply to it, and do not switch auth routes to obtain diagnostics.

Document the pre-switch High miss independently from the Low-effort miss. Do not call a request-index comparison a matched execution stage without proof.

Official references to validate against the current implementation:
- [Prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching)
- [Prompt-cache diagnostics](https://developers.openai.com/api/docs/guides/prompt-caching/diagnostics)
- [GPT-6 model configuration guidance](https://developers.openai.com/api/docs/guides/latest-model)

### 4. Perform a fully observed controlled comparison

After instrumentation is in place, use genuine provider inference on equivalent realistic multistage tasks with a fresh, matched initial state. Hold constant model, version, tools, permissions, auth route, source files, success checks and task instructions. Only the effort-routing control varies. Measure execution-path divergence instead of forcing equal request counts.

Control for cache warming, ordering and time; where necessary alternate run order or add a small number of matched pairs. Use enough evidence to answer the material uncertainties, **not an arbitrary sample count or sprawling benchmark framework**. Capture failed/incomplete runs and retries rather than hiding them. If instrumentation alters the request shape or timing, quantify it.

### 5. Analyse resource cost and quality

For every request and whole completed task, calculate input, cached, uncached, output and reasoning subset; inference requests, elapsed time, router/settings overhead, tool calls, repairs/retries, correctness and quality. Attribute differences to observed causes only when the evidence permits.

Estimate API-equivalent cost **only with verified applicable input, cached-read, cache-write (if metered), and output pricing**. Distinguish token accounting from real ChatGPT subscription charges; do not add reasoning-token counts to output again. Compare resources per **correct completed task** and identify trade-offs between latency, quality and token cost.

### 6. Publish findings, not speculation

Deliver:
- **Private chronological traces** and corresponding local evidence index in TEST.
- **Sanitized per-request telemetry** keyed by stable study/run IDs, including explicit missing fields.
- **Two aligned turn timelines** and a baseline/adaptive task-level comparison.
- **Per-cache-miss cause ledger**: observed prefix difference, provider diagnostic if available, confidence, alternative causes and resource impact.
- **A root-cause report** separating confirmed facts, likely explanations, unknowns and additional runtime inefficiencies (extra requests, repeated tools, context duplication, compaction, failed continuations).
- **Ranked recommendations** based on potential savings, evidence strength, difficulty and correctness risk. **Do not implement optimisations in this investigative phase.**

Commit sanitized reports/tools here, link their source hashes and relevant issue/PR, and preserve dated observations instead of overwriting them with later conclusions. Verification and exact TEST restoration belong in the final report.

## Decision rule

Do not declare adaptive effort cheaper based on an isolated Low request, a shorter task duration, or an unpriced cached-token fraction. Do not declare it inherently harmful based on one preliminary pair. Decide whether to retain, redesign or disable automatic effort changes **only after** full-task resource, correctness and cache-causality evidence is strong enough.
