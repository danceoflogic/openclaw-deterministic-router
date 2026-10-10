# Current status — 2026-10-11

- The current development/integration target is OpenClaw 2026.9.8, matching the live Worktop runtime. The earlier 2026.9.6 observations below are historical evidence, not the current target.
- Issue #3 implementation is merged into `main` (PR #19). A live interactive manual `/model`-then-restart acceptance remains unverified; do not infer it from unit tests or loader smoke.
- Issue #6 has a real Worktop 2026.9.8 document-upload shadow result: the attachment floor promoted SIMPLE to MEDIUM. Its source is published on `issue-6-attachment-proof-20261010` but has not been merged; issue #6 remains open.
- Keep `shadow` as the default. Controlled AUTO, subagent independence, and release compatibility remain open acceptance work (issues #7, #8, and #12).
- This branch updates the version target and documentation. A green local check establishes build/test compatibility, not completion of the live AUTO gates.

---

# Historical progress notes

## Status recorded before Issue #3 merge

## Status

- [Issue #3 — manual model lock across restart and pre-existing session state](https://github.com/danceoflogic/openclaw-deterministic-router/issues/3) is closed on GitHub with code-level and isolated-runtime evidence.
- The implementation is on `issue-3-manual-lock-restart` and has not been merged into `main`.
- `npm run check` passed (typecheck, 33 tests, build); an isolated OpenClaw 2026.9.8 Gateway loaded the plugin and hooks and passed health/readiness checks.
- A live interactive `/model`-then-Gateway-restart round-trip was **not completed**. The CLI attempt was treated as a prompt; no live manual-selection result is claimed.
- Keep `shadow` as the repository default. AUTO remains disabled by default; controlled AUTO validation requires the remaining manual-selection and effective-model acceptance gates.
- Manual user model selection remains authoritative. Missing or ambiguous persisted state must fail closed.
- Do not alter tier classification or model mappings. Keep the archived persisted-read alternative separate from this branch.

## 2026-09-26 — implementation

- Added per-turn authoritative reconciliation through OpenClaw 2026.9.6's runtime session accessor.
- Added explicit locked/clear/unknown registry state and stale-lock invalidation for missing or ambiguous entries.
- Added regression coverage for restart, default clearing, session isolation, reset/recreation, deletion, and fail-closed behavior.
- Updated the integration and acceptance documentation.
- Validation passed: `npm run check` (33 tests, typecheck, ESM build, declaration build) and the isolated CI runtime-loader smoke.

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
