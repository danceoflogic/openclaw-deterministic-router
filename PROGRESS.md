# Current issue: #3 — manual model lock across restart and pre-existing session state

## Status

- Issue #2 is complete and PR #15 has been merged to `main`.
- Current active work item: [Issue #3 — Verify and harden manual model lock across restart and pre-existing session state](https://github.com/danceoflogic/openclaw-deterministic-router/issues/3).
- Gate B remains blocked on Issue #3.
- Keep `shadow` as the default. Do not enable AUTO until Issue #3 passes.
- Manual user model selection is authoritative.
- If authoritative persisted model-selection state cannot be established after restart, fail closed rather than guessing.
- Scope for Issue #3: restart/pre-existing selection, clearing back to default, two-session isolation, session reset/deletion, ambiguous or missing state, regression coverage, and `npm run check`.
- Do not alter tier classification or model mappings.

---

# Completed issue: #2 — actual model-call telemetry and decision correlation

## 2026-09-26

- Confirmed worktree is on `issue-2-model-call-telemetry`, with no merge, push, model change, or Issue #3 work.
- Inspected the existing `model_call_started`/`model_call_ended` correlation and OpenClaw 2026.9.6 runtime declarations.
- Verified the installed runtime is `OpenClaw 2026.9.6 (eb377ac)`. Its Codex bundle contains no native dispatch of the typed `model_call_started`/`model_call_ended` hooks; the native path dispatches `llm_input`/`llm_output`/`agent_end` adapter observations instead.
- Verified the installed Codex bundle emits trusted `model.call.started`/`completed`/`error` diagnostics with `runId`, synthetic `callId` (`<runId>:codex-model:1`), provider/model, api/transport, and `observationUnit: "turn"`. OpenClaw documents a turn as an opaque CLI turn that may contain hidden requests, retries, tool work, or background work.
- Added a metadata-only `model_identity_observed` fallback at `agent_end`, using the resolved `modelProviderId`/`modelId` context for native runtimes that emit no provider-call hooks.
- Kept the fallback run-scoped, `resolved*`-labelled, and callId-free; embedded call-hook telemetry suppresses the fallback to avoid duplicate observations.
- Added a separate metadata-only turn diagnostic bridge and correlation map. It snapshots the router decision per native diagnostic callId, retains api/transport/outcome/duration, and keeps `resolved*` labels; it does not relabel turn diagnostics as provider calls or log private model content/request IDs.
- Added explicit `verificationLevel` values: `selected-only` for router decisions, `provider-call` for embedded model-call hooks, and `runtime-model` for native run/turn observations.
- Added regression tests for native fallback attribution, trusted turn filtering, turn correlation, delayed terminal events, and embedded-call suppression. Native turn diagnostics are explicitly not provider-call evidence.
- No live Codex inference or auth/config change was attempted. The installed lifecycle shows compact/fresh-thread retries inside the same turn diagnostic, with no separate per-provider retry/fallback call observation.
- `git diff --check` passes.
- `npm run check` passes: typecheck, 24 tests, ESM build, and declaration build.
- OpenClaw 2026.9.6 runtime-loader smoke passes in an isolated temporary state/config.
- Native Codex provider-call-per-hidden-request identity remains unavailable by supported contract; this is documented as an accepted runtime-model limitation for Issue #2, not a blocker.
