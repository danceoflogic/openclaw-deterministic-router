# Changelog

All notable changes to this project will be documented here.

## [Unreleased]

### Fixed

- 2026-10-12, Issue #7: release native diagnostic subscriptions through OpenClaw 2026.9.8 `api.lifecycle.onDispose`, including cleanup-registration failure; leave native diagnostics unsubscribed when managed disposal is unavailable, with an explicit warning and retained run-level `agent_end` observation. No classification or tier-mapping change.
- Verification: initial focused tests passed 27/27 across three files; required `npm run check` passed typecheck, all 45 deterministic tests across seven files, and local build. Added managed registration/disposal/replacement, duplicate-prevention, repeated-cleanup, unmanaged/rejected-registration, reset-retained user selection and exact agent-scoped latest-read coverage. No live inference, deployment or operational/session change.
- Rollback: revert only this isolated listener-lifecycle fix and associated regressions. It does not reclaim previously leaked listeners in an already-running old process; deployment and any process cleanup require a separate decision.
- Generate declarations with the TypeScript compiler instead of tsup's incompatible declaration bundler, supporting TypeScript 7 without changing the JavaScript bundle.

## [0.1.0] - 2026-09-25

### Added

- publication-ready OpenClaw native plugin scaffold;
- deterministic Router Core classifier pin;
- tier-to-model policy layer;
- shadow/off/auto operating modes;
- manual session-selection tracking scaffold;
- structured prompt-free routing telemetry;
- unit tests, architecture docs and rollout plan.
