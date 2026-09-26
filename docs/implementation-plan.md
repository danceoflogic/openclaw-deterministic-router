# Implementation plan

## Phase 0 — Baseline

- Target OpenClaw `2026.9.6` for the current integration baseline.
- Pin Router Core to `5ee7c23c993013a8052588191569db5cf7fb793c`.
- Record the exact deployed OpenClaw version and verify it is `2026.9.6` before running the current compatibility suite.
- Run deterministic golden fixtures repeatedly.
- Confirm no routing-time network/LLM call occurs.

**Gate:** identical inputs produce identical classifier outputs.

## Phase 1 — Hook probe

Run in `shadow` mode and verify the actual target runtime exposes the expected context for:

- `before_model_resolve`
- `session:patch`
- `model_call_started` / `model_call_ended` for sanitized provider-call telemetry on the embedded path; record the strongest separately labelled runtime-model observation supported by native Codex (see [effective-model observability](model-observability.md))
- subagent lifecycle hooks

**Gate:** document the concrete fields observed on the deployed OpenClaw build.

## Phase 2 — Manual-selection protection

Test:

- `/model` selecting Luna
- `/model` selecting Terra
- `/model` selecting Sol
- clearing the manual override back to the default/automatic state

The router must yield to an explicit manual selection.

**Gate:** no manual selection is silently replaced.

## Phase 3 — Effective-model correlation

Correlate each router decision with the model OpenClaw actually calls.

**Gate:** selected model and effective model agree whenever the router reports `applied: true`.

## Phase 4 — Subagent boundary

Verify a high-tier parent does not force trivial children to inherit that tier when OpenClaw gives the child an independent resolution hook.

**Gate:** state the achieved guarantee precisely: per turn, per subagent, and/or per model inference.

## Phase 5 — Shadow benchmark

Run representative workloads through `shadow` mode:

- simple conversation
- file operations
- retrieval/search
- summarisation
- coding/debugging
- multi-document analysis
- deep reasoning
- subagents
- attachment-bearing turns

Review under-routing, over-routing and ambiguous cases.

## Phase 6 — Controlled auto rollout

Enable `auto` on a limited test agent, retain a one-switch rollback to `shadow` or `off`, and monitor effective-model telemetry.

## Definition of done

- deterministic local classification
- no LLM call for routing
- manual selection respected
- effective model independently verifiable
- subagent behavior measured rather than assumed
- config-driven model policy
- prompt-free audit records
- immediate rollback path
