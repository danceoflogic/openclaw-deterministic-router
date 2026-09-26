# Active blocker context

## Current active blocker: Issue #3 — manual model lock across restart and pre-existing session state

Gate B is currently blocked on [Issue #3](https://github.com/danceoflogic/openclaw-deterministic-router/issues/3).

The router must prove that explicit manual model selections remain authoritative across plugin/Gateway restart and pre-existing session state. If authoritative persisted model-selection state cannot be established, the router must fail closed rather than guess.

Issue #3 scope includes:

- restart with a pre-existing manual model selection;
- returning the session to default/automatic selection;
- two-session isolation;
- session reset/deletion without stale lock leakage;
- ambiguous or missing persisted state;
- regression coverage and `npm run check`.

Keep `shadow` as the default. Do not enable AUTO until Issue #3 passes. Do not alter tier classification or model mappings.

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
