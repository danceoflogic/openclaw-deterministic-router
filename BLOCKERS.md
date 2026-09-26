# Issue #2 blockers and accepted limitations

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

The router now consumes that metadata-only trusted diagnostic SDK surface into `model_identity_observed` records with `observationScope: "turn"`, `source: "diagnostic_model_call"`, and `resolvedProvider`/`resolvedModel`. The run-end fallback remains separately labelled as `observationScope: "run"`, `source: "agent_end_context"`, and callId-free. Neither signal claims a provider request or per-request effective model; embedded `model_call_*` records retain `effective*` labels because OpenClaw documents those as provider-call metadata.

## Current status

There is no unresolved blocker for the current Issue #2 contract. Native Codex does not expose a supported provider-call identity for every hidden request, retry, or fallback. The issue explicitly accepts that limitation when the strongest supported observation is recorded honestly as `verificationLevel: "runtime-model"` rather than `provider-call`.

The current loader smoke proves plugin registration and the unit tests prove filtering/correlation of the supported metadata-only diagnostic surface. It does not claim a live native Codex run or per-request provider identity. No live inference was attempted because obtaining it would require disturbing the production-like auth/config boundary.
