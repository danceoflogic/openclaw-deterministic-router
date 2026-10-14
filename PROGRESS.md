# Current status — 2026-10-14

- **Issue #7 update:** R2 shadow deployment passed on 13 October; authenticated status-scope allow/deny passed on 14 October. Two no-turn Codex fixtures were created. Their allowlist write returned nonzero after applying; final readback confirmed guarded shadow and matching applied revisions. No AUTO or inference ran. Candidate implementation remains unmerged; A/B and lifecycle acceptance remain open. See the [engineering and deployment record](docs/issue-7-progress-2026-10-13.md).

- **PR #33 review milestone:** both P2 status defects confirmed/fixed; 58 tests/typecheck/build and remote CI passed. Supervisor verified focused regression failures on old source/passes on corrected source. Fixes remain unmerged and not deployed; existing R2 receipts retain their scoped historical meaning.

- **Target:** OpenClaw 2026.9.8 on Worktop. OpenClaw 2026.9.6 results below are historical, not a claim of current AUTO compatibility.
- **Implemented and merged:** deterministic classifier/policy matrix (#4), model identity telemetry with native-runtime limits (#2), persisted manual-selection reconciliation (#3), shadow acceptance (#5), and the real-document attachment-floor fix (#6, PR #22). CI passed on the merged 2026.9.8 target.
- **Observed on Worktop:** in `shadow`, a real text document promoted SIMPLE to MEDIUM, while an attached REASONING turn stayed REASONING. The audit contained structural attachment metadata, not document content. This did not apply a model override.
- **Historical partial evidence:** 11 October native turn/run observations cover tier routing, genuine manual selection across restart, default/AUTO resumption and shadow/off; these do not establish acceptance of the new allowlisted candidate. **Outstanding:** independent ordinary-session A/B selected/effective-model isolation and lifecycle acceptance (#7), then independent subagent routing (#8). Keep `shadow` as the default.
- **Beta gate:** complete #7 and #8 with evidence on the target runtime, restore `shadow` after bounded tests, and document any native turn-level observability limit. This is a functional beta, not a release claim.
- **Release work after beta:** overhead/restart/telemetry measurements (#9), compatibility and dependency reproducibility policy (#12), and the remaining release-level acceptance checks in #10.
- **Tracker:** #6 is closed with the real-document evidence and merged PR #22; #10 marks the attachment shadow gate complete. The AUTO and subagent gates remain open.

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


## Issue #7 recommendation — embedded alternative review (14 October)

**Recommend one maintainer-scoped Codex request-ownership diagnostic. Do not switch to embedded A/B now.** Embedded equivalence is not substantiated, not proven impossible.

Latest execution supersedes the earlier NOT RUN status: A was attempted once and rejected by OpenClaw request-ownership authorization (403); B was withheld. A is a valid root fixture with matching persisted session and Terra binding. The denying live predicate was not logged, so existing evidence cannot identify its branch. Stop searching for missing historical evidence; no A retry or credential change.

Embedded assessment:
- Compatibility: installed 2026.9.8 embedded support for manual Terra and AUTO GPT-6 Luna remains unverified; Codex catalog/auth does not establish embedded adapter compatibility.
- Manual selection: model-selection controls alone do not establish a supported per-session embedded runtime selector and persisted manual-source semantics.
- Isolation: existing A/B are Codex fixtures and must remain intact. An alternative needs independently verified fresh isolated embedded sessions; no session operation was performed.
- Effective-model evidence: reviewed router source supports embedded `model_call_started`/`model_call_ended`, correlated by run/call, stronger than native turn-scoped `runtime-model`. This capability is not a received live event or acceptance pass.
- Costs: embedded auth/billing identity and allowance are unknown. A completed-turn ceiling is not a hard provider-request/token/spend cap; utility calls, retries/fallbacks can exceed turn counts. No inference was executed in this review.

The worker's one pinned read-only Worktop attempt failed at DNS before remote execution. Installed-runtime feasibility therefore remains UNKNOWN; no alternate route or operational change was made.

Ask the maintainer for temporary instrumentation at the Codex ownership decision: stable denial-reason enum and booleans for owner-match and root/session-binding predicates, correlated through an opaque attempt ID. No prompts, responses, credentials, raw session identifiers or tokens. Review the patch first; any future single isolated reproduction requires separate explicit approval. Do not retry A. This establishes the denying authorization branch, **not router A/B acceptance**.

Recorded final shadow restoration and preserved fixtures remain authoritative retained evidence, not a fresh live attestation. All outstanding A/B/lifecycle checkboxes remain open; no rollout, merge or issue closure. Supervisor reviewed the saved worker report, telemetry source/docs and execution receipt. Requested worker Luna/medium was not independently attested; supervisor runtime mismatch was reported, settings unchanged.
