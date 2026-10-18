# Changelog

All notable changes to this project will be documented here.

## [Unreleased]

### 2026-10-18 — functional TEST milestone

- [PR #40](https://github.com/danceoflogic/openclaw-deterministic-router/pull/40) merged as `217c5ae`: complete `modelOverrideSource: auto` child selection handled without a false manual lock; empty-by-default `autoSpawnParentGrants` authorizes only exact human-created parent incarnations and verified same-agent direct children; first-turn operator acceptance logic and regressions added.
- Existing-child follow-up and **first-turn** real `sessions_spawn` child routing passed in isolated OpenClaw 2026.10.4 TEST. First-turn parent Sol, child Luna and completion Luna were independently recorded at OpenClaw agent-turn scope, **3/4 approved turns**, no retries; TEST restored exactly, production unchanged ([#8 evidence](https://github.com/danceoflogic/openclaw-deterministic-router/issues/8#issuecomment-6252069728)).
- Five ordinary-turn controls accepted under #7 on 17 October. Per-provider-request accounting, live lifecycle fault cases, measured cost savings, per-tier effort control and broad production rollout are **not** established.
- PR #40 CI passed at `15fda37` (83 Vitest tests, typecheck and build), with 43 local operator-tool tests recorded by the PR.


### Fixed

- 2026-10-14, Issue #7: use fresh UUIDs for status registration generations and explicitly mark the read-only status RPC `profileAccess: "independent"`; `operator.read` remains required. Pinned Gateway authorization regression now derives both profile access and scope from actual registration options.
- 2026-10-12, Issue #7: release native diagnostic subscriptions through OpenClaw 2026.9.8 `api.lifecycle.onDispose`, including cleanup-registration failure; leave native diagnostics unsubscribed when managed disposal is unavailable, with an explicit warning and retained run-level `agent_end` observation. No classification or tier-mapping change.
- Verification: initial focused tests passed 27/27 across three files; required `npm run check` passed typecheck, all 45 deterministic tests across seven files, and local build. Added managed registration/disposal/replacement, duplicate-prevention, repeated-cleanup, unmanaged/rejected-registration, reset-retained user selection and exact agent-scoped latest-read coverage. No live inference, deployment or operational/session change.
- Rollback: revert only this isolated listener-lifecycle fix and associated regressions. It does not reclaim previously leaked listeners in an already-running old process; deployment and any process cleanup require a separate decision.
- Generate declarations with the TypeScript compiler instead of tsup's incompatible declaration bundler, supporting TypeScript 7 without changing the JavaScript bundle.

### Added

- Issue #7 local integration candidate, based on main `dc6fb239a5c7e80a74b13b223bec2bf7538b59e0`: exact session-key SHA-256 AUTO allowlisting (empty by default, malformed lists fail closed) and read-only status RPC reporting the active registration identity and captured mode/safeguards without exposing hashes. Shadow remains the default.
- Regressions cover exact/empty/invalid allowlists, same-agent session separation, manual-selection protection, missing session identity, off/shadow behavior, status snapshot/lifecycle, and the pinned Gateway `operator.read` dispatch authorization. Local tests and loader smoke do not establish authenticated live RPC or live AUTO acceptance; see the integrated candidate evidence package.

## [0.1.0] - 2026-09-25

### Added

- publication-ready OpenClaw native plugin scaffold;
- deterministic Router Core classifier pin;
- tier-to-model policy layer;
- shadow/off/auto operating modes;
- manual session-selection tracking scaffold;
- structured prompt-free routing telemetry;
- unit tests, architecture docs and rollout plan.
