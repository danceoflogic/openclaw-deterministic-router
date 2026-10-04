# Acceptance and blocker context

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
