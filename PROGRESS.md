# Issue #2 progress

## 2026-09-26

- Confirmed worktree is on `issue-2-model-call-telemetry`, with no merge, push, model change, or Issue #3 work.
- Inspected the existing `model_call_started`/`model_call_ended` correlation and OpenClaw 2026.9.6 runtime declarations.
- Added a metadata-only `effective_model_observed` fallback at `agent_end`, using the resolved `modelProviderId`/`modelId` context for native runtimes that emit no provider-call hooks.
- Kept the fallback run-scoped and callId-free; embedded call-hook telemetry suppresses the fallback to avoid duplicate observations.
- Added regression tests for native fallback attribution and embedded-call suppression.
- `git diff --check` passes.
- Required validation is blocked by an interrupted/incomplete dependency tree; details are in `BLOCKERS.md`.
- Runtime-loader smoke was attempted against the installed OpenClaw 2026.9.6 runtime but cannot load the plugin because this checkout has no built `dist/index.js`.
