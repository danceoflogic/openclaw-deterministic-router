# Issue #2 blockers

## 2026-09-26 — local validation dependency interruption resolved

The initial local run encountered a partial dependency tree. The missing TypeBox and TypeScript runtime files were restored from the installed OpenClaw 2026.9.6 dependency copy; no source dependency or lockfile was changed.

Validation now passes:

- `npm run check`: typecheck, 21 tests, ESM build, and declaration build.
- OpenClaw 2026.9.6 runtime-loader smoke: passed in an isolated temporary state/config.

## 2026-09-26 — native Codex call-level evidence remains open

The run-end context fallback is labelled `model_identity_observed` with `observationScope: "run"`, `source: "agent_end_context"`, and `resolvedProvider`/`resolvedModel`. It does not claim a provider request, `callId`, retry, or fallback was observed. Embedded `model_call_*` records retain the `effective*` labels because OpenClaw documents those as provider-call metadata.

Issue #2 cannot be closed for native Codex until OpenClaw/Codex exposes and the project verifies a supported call-level provider/model observation, including retries/fallbacks. The current loader smoke proves registration only; it does not prove native Codex emission or actual provider-call identity.
