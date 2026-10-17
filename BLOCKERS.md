# Current blockers — 2026-10-17

- **Remaining Issue #7 acceptance:** Bounded manual-precedence, genuine AUTO switch, clear-to-default, `shadow`, and `off` functional checks passed on isolated OpenClaw 2026.10.4 TEST. Live reset/deletion/recreation and unknown-state fail-closed checks remain open. [A/B evidence](https://github.com/danceoflogic/openclaw-deterministic-router/issues/7#issuecomment-6239935075) · [controls evidence](https://github.com/danceoflogic/openclaw-deterministic-router/issues/7#issuecomment-6240041352).
- **Provider accounting:** OpenClaw-reported resolved models and router audits are functional evidence, not independent proof of upstream provider calls. The owner's turn-level OpenAI accounting review remains deferred and separate from #7 functional acceptance.
- **Source/rollout:** [PR #38](https://github.com/danceoflogic/openclaw-deterministic-router/pull/38) (operator runner) and [PR #36](https://github.com/danceoflogic/openclaw-deterministic-router/pull/36) (model defaults) are open and unmerged. The TEST runner restored its captured settings; no production change or general AUTO rollout is claimed. Both approved TEST turn budgets are exhausted.
- **Other gates:** Independent child routing (#8), performance/restart measurements (#9), and version/dependency policy (#12) remain pending.

Next: design a separately bounded lifecycle/unknown-state check, then obtain any needed new live-turn authority. Keep `shadow` as the safe default; do not repeat the completed A/B or controls turns merely to recreate evidence.

---

## Historical blockers — 2026-10-15

- **Runtime acceptance (#7):** No completed ordinary-root GPT-6 A/B AUTO acceptance. The older synthetic fixture A produced an ownership-related 403; one separate native Sol success is insufficient to clear it. Controlled A/B prompts were not run in the latest Worktop attempt.
- **Session setup:** The initial fresh/idle-root prerequisite was not satisfied (one root old; one root already containing an ordinary UI bootstrap turn). A proposed bootstrap revision remains unapproved. The dedicated test-agent default was temporarily changed to GPT-6 Sol from GPT-5.6 Luna; preserve its exact checked restoration target.
- **Source/deployment distinction:** [PR #33](https://github.com/danceoflogic/openclaw-deterministic-router/pull/33) merged 15 October; [PR #36](https://github.com/danceoflogic/openclaw-deterministic-router/pull/36) is open/unmerged. Retained Worktop evidence says the GPT-6 bundle is deployed in guarded `shadow`; this is **not** an AUTO pass nor proof the pending model-default source migration merged.
- **Subagent gate (#8):** Independent child routing and observed effective model not yet accepted.
- **Release gates (#9, #12):** Performance/restart data and version/dependency policy remain pending.

The active next action is a **minimal, deterministic A/B procedure review**, not another unbounded retry cycle. Preserve exact-session containment, independent runtime-model evidence, a maximum of two controlled A/B inferences without retries, and verified shadow/configuration restoration. Historical fixtures and attempt evidence stay intact. Do not treat the unmerged `main` A/B wording as the approved GPT-6 procedure; see [#7](https://github.com/danceoflogic/openclaw-deterministic-router/issues/7), [#10](https://github.com/danceoflogic/openclaw-deterministic-router/issues/10) and pending PR #36.

---

## Historical snapshot — 2026-10-11

- **Functional-beta gate:** #7 has not demonstrated live AUTO selected/effective-model agreement, manual override precedence (including a genuine interactive selection across restart), or the `shadow`/`off` rollback path on OpenClaw 2026.9.8.
- **Subagent gate:** #8 has not demonstrated an independent child decision and effective model distinct from a stronger parent when the child's work is simpler.
- **Release gate:** #9 performance/restart measurements and #12 compatibility/reproducibility policy remain open. The declared version range must not be read as tested AUTO support across all versions.
- #6's real-document shadow result passed, its implementation is merged in PR #22, and the issue is closed. It is no longer a beta blocker.
- Keep AUTO disabled by default. Do not treat unit tests, loader smoke, or turn-scoped native telemetry as proof of live provider-call-level AUTO behaviour. See the acceptance protocol.

---

# Historical blocker notes

## Acceptance and blocker context before Issue #3 merge

## Issue #3 — closed on GitHub; implementation pending PR

[Issue #3](https://github.com/danceoflogic/openclaw-deterministic-router/issues/3)
was closed after its comment recorded code-level and isolated-runtime evidence.
The implementation is on `issue-3-manual-lock-restart`, not yet merged into `main`.

`npm run check` passed (typecheck, 33 tests, build). Regression tests cover
pre-existing persisted overrides, a fresh router instance, default clearing,
two-session isolation, reset/recreation, and missing or ambiguous state failing
closed. An isolated OpenClaw 2026.9.8 Gateway loaded the plugin and hooks and
passed health/readiness checks.

A **live interactive `/model`-then-Gateway-restart round-trip was not
completed**. The attempted CLI command was interpreted as a prompt, and the
disposable profile's configured target was unknown. The tests and loader smoke
must not be described as that live acceptance check.

Keep `shadow` as the repository default; do not enable AUTO by default.
Controlled AUTO validation still requires the live manual-selection and
effective-model gates in the acceptance protocol. Do not alter tier
classification or model mappings as part of this issue.

---

# Completed Issue #2 blockers and accepted limitations

## 2026-09-26 — local validation dependency interruption resolved

The initial local run encountered a partial dependency tree. The missing TypeBox and TypeScript runtime files were restored from the installed OpenClaw 2026.9.6 dependency copy; no source dependency or lockfile was changed.

Validation now passes:

- `npm run check`: typecheck, 24 tests, ESM build, and declaration build.
- OpenClaw 2026.9.6 runtime-loader smoke: passed in an isolated temporary state/config.

## 2026-09-26 — native Codex emits turn diagnostics, not provider-call hooks

Runtime evidence from the installed OpenClaw `2026.9.6 (eb377ac)` and managed Codex bundle:

- The native Codex bundle does not contain or dispatch the typed `model_call_started`/`model_call_ended` hooks. Those hooks are documented as embedded model-call-path telemetry; native Codex lifecycle hooks are adapter observations.
- The Codex emitter dispatches trusted `model.call.started`/`completed`/`error` diagnostics with `runId`, `callId`, provider/model, api/transport, and `observationUnit: "turn"`. Its installed call ID is synthetic (`<runId>:codex-model:1`), not an upstream provider request ID.
- OpenClaw documents `turn` as one opaque CLI turn that may contain hidden model requests, retries, tool work, or background work. The bundled compact/fresh-thread retry paths remain inside that one diagnostic lifecycle, so no supported per-provider retry/fallback call identity is exposed.

The router consumes that metadata-only trusted diagnostic SDK surface into `model_identity_observed` records with `observationScope: "turn"`, `source: "diagnostic_model_call"`, and `resolvedProvider`/`resolvedModel`. The run-end fallback remains separately labelled as `observationScope: "run"`, `source: "agent_end_context"`, and callId-free. Neither signal claims a provider request or per-request effective model; embedded `model_call_*` records retain `effective*` labels because OpenClaw documents those as provider-call metadata.

## Issue #2 completion status

Issue #2 is complete. PR #15 was merged to `main`, and the native Codex provider-call-per-hidden-request limitation is an accepted `runtime-model` limitation under the final Issue #2 contract.

The loader smoke proves plugin registration and the unit tests prove filtering/correlation of the supported metadata-only diagnostic surface. It does not claim a live native Codex run or per-request provider identity.

## Issue #3 implementation status

The authoritative session accessor is reconciled before each routing decision.
Missing, malformed, or ambiguous persisted selection state fails AUTO closed
and removes stale process-local locks. The code-level blocker is addressed on
the issue branch; the live interactive restart check and controlled AUTO gates
remain outstanding.
