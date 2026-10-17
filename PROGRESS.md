# Current status — 2026-10-17

**Bounded TEST routing checks passed; Issue #7 remains open.** On isolated OpenClaw 2026.10.4 TEST, the owner-approved two-turn A/B window verified manual Sol precedence over AUTO and a genuine default-Sol to routed-Luna switch. A separately approved three-turn window verified clearing the manual choice resumes AUTO, `shadow` logs without applying the Luna candidate, and `off` emits no router decision. Both windows used their exact ceilings (2/2 and 3/3), with no retries. Correlated router audits, persisted selection/default state, completed turns, and OpenClaw-reported resolved models support these **functional** results. See [Issue #7](https://github.com/danceoflogic/openclaw-deterministic-router/issues/7#issuecomment-6239935075) and its [controls result](https://github.com/danceoflogic/openclaw-deterministic-router/issues/7#issuecomment-6240041352).

**Containment and source state:** The runner restored the captured TEST router mode and allowlist, agent default, and temporary selection after each window; post-run read-only preflight returned READY, and no recovery file remains. [PR #38](https://github.com/danceoflogic/openclaw-deterministic-router/pull/38) contains the external operator runner and detailed private-report procedure; it is open and unmerged. [PR #36](https://github.com/danceoflogic/openclaw-deterministic-router/pull/36) is also open and unmerged. These TEST observations do not imply that either PR was merged, that production changed, or that general AUTO rollout is approved.

**Still open:** Live lifecycle/reset/deletion/recreation and unknown-state fail-closed acceptance for #7; independent child routing (#8); release gates (#9, #12). Provider-side model identity is deferred to the owner's turn-level accounting logs and must not be inferred from router `applied=true` or OpenClaw's resolved-model report. The owner approved a separate three-turn lifecycle window, but its first attempt stopped before inference because the paired operator device has no authenticated human profile. The three-turn budget remains unused. A profile-authenticated creation path is needed to preserve the lifecycle gate's human-creator check; retain guarded `shadow` meanwhile.

### PR #38 runner detail

- The external operator runner uses TEST-only, human-profile-actor session discovery, exact private session-key hashing, bounded turns, TEST journal audit correlation, PASS/FAIL/INCONCLUSIVE reporting, and finally-based restoration. Its private recovery file supports a no-inference `restore` after interruption. See [operator instructions](docs/operator-acceptance-runner.md).
- A's terminal event briefly preceded its idle projection. The initial command withheld B after one turn and restored TEST; the B-only continuation validated A's saved PASS record and spent only the remaining approved turn. The private 0600 combined report records `result=PASS`, `turns=2`, `restoration=PASS`.
- The later controls report records `result=PASS`, `turns=3`, `restoration=PASS`; B stayed clear and untouched. A separate read-only preflight returned READY after both windows, with no recovery file left. The private reports are not committed to the repository.
- Focused acceptance tests **22/22**, typecheck, build, and PR CI passed on the pre-merge runner head. No additional inference was performed by the documentation sync.

---

## Historical status — 2026-10-15

**Source versus deployment:** [PR #33](https://github.com/danceoflogic/openclaw-deterministic-router/pull/33) merged into `main` on 15 October 2026. [PR #36](https://github.com/danceoflogic/openclaw-deterministic-router/pull/36), migrating committed model defaults to GPT-6 Luna/Sol, is open and not merged. The merged `main` mappings and the already-deployed Worktop GPT-6 shadow bundle must not be conflated.

**Last retained Worktop observation:** OpenClaw 2026.9.8 healthy; the GPT-6 bundle was active under guarded `shadow`, with both protections enabled and the existing two-entry allowlist preserved. This is an operator-reported readback from 15 October, not a fresh live inspection by this documentation update. The dedicated test-agent model was temporarily set to GPT-6 Sol for A/B preparation; its original GPT-5.6 Luna default must be restored with checked compare-and-set after the bounded work.

**Acceptance:** The approved ordinary-root GPT-6 A/B AUTO test has **not completed**; earlier synthetic A hit an ownership-related 403. The proposed UI-bootstrap revision is not an approved execution instruction. Independent subagent and lifecycle acceptance also remain open (#7, #8, #10). No rollout, new inference, restart or configuration change is authorized by this progress update.

**Next:** Simplify the A/B execution procedure, keep one evidence trail, avoid repeating passed historical probes, and preserve rollback and historical fixtures. Canonical live-acceptance status: [#7](https://github.com/danceoflogic/openclaw-deterministic-router/issues/7) and [#10](https://github.com/danceoflogic/openclaw-deterministic-router/issues/10). The pending [PR #36](https://github.com/danceoflogic/openclaw-deterministic-router/pull/36) contains the updated GPT-6-specific test protocol; older default-target descriptions on `main` must not be used for a new live AUTO gate.

---

## Historical snapshot — 2026-10-11

## Historical preparation — 2026-10-13 Issue #7 clean integration candidate

- This clean integration branch is based on current main `dc6fb239a5c7e80a74b13b223bec2bf7538b59e0` and contains the merged PR #31 listener lifecycle corrections plus Issue #7 allowlist/status work. The original dirty candidate and its archive remain preserved.
- At this preparation stage, no installed bundle, Gateway, runtime config or AUTO mode was changed. Subsequent R2 deployment and status-scope results are recorded on Issue #7.
- Added exact session-key SHA-256 allowlisting (default empty and fail-closed), read-only registration status, and private status unknown behavior. Added config, allowlist, mode, and status regressions.
- Combined `npm run check` and isolated OpenClaw 2026.9.8 loader smoke are run on this clean integration checkout; exact results and artifact identities are in its evidence report.
- **At preparation time:** live RPC, effective mode/revision, deployment and AUTO acceptance were unverified. Subsequently R2 shadow deployment and authenticated status-scope allow/deny passed; ordinary-session A/B and lifecycle acceptance remain open. See [Issue #7](https://github.com/danceoflogic/openclaw-deterministic-router/issues/7) for the current evidence ledger. Unit and loader checks are not operational acceptance.

- **Target:** OpenClaw 2026.9.8 on Worktop. OpenClaw 2026.9.6 results below are historical, not a claim of current AUTO compatibility.
- **Implemented and merged:** deterministic classifier/policy matrix (#4), model identity telemetry with native-runtime limits (#2), persisted manual-selection reconciliation (#3), shadow acceptance (#5), and the real-document attachment-floor fix (#6, PR #22). CI passed on the merged 2026.9.8 target.
- **Observed on Worktop:** in `shadow`, a real text document promoted SIMPLE to MEDIUM, while an attached REASONING turn stayed REASONING. The audit contained structural attachment metadata, not document content. This did not apply a model override.
- **Still unverified:** a live interactive manual `/model` selection across Gateway restart; controlled AUTO selected/effective-model and manual-precedence checks (#7); independent subagent routing (#8). Keep `shadow` as the default.
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
# Issue #7 lifecycle preparation — 17 October 2026

PR #38 contains a three-turn TEST lifecycle sequence using supported external operator `sessions.create/reset/delete`, generation and human-attribution guards, exact session allowlisting, correlated journal evidence and private recovery. The owner approved three new TEST turns and disposable lifecycle operations. A fresh read-only dry-run passed its prerequisites with zero turns and mutations. The live command then created only disposable A and stopped **before reset, deletion, or inference**: its paired device is an operator but has no authenticated human profile, so `sessions.create` stamped no human `createdActor`; `sessions.describe` also omits `lifecycleRevision` from its public projection. The runner failed closed with `turns=0` and a recovery record. After inspecting the TEST canonical row and confirming B absent, A was deleted using its exact session ID; the router config and agent default matched the saved baseline before and after, and the recovery record was cleared. No turns were spent, no recovery remains, and no live lifecycle PASS is claimed. Creation provenance is write-once; mutable owner assignment cannot repair it. A supported profile-authenticated creation and same-key recreation path is required before this gate can run. Focused offline fault tests cover missing/malformed authoritative state and stale-lock removal. The previously passed five TEST turns are unchanged.
