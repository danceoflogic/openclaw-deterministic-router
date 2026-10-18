# Implementation plan

**18 October 2026 checkpoint:** Deterministic routing, five ordinary-turn controls and independently routed existing-/first-turn OpenClaw child turns passed in isolated OpenClaw 2026.10.4 TEST. PR #40 merged, production unchanged. The phases below document historical implementation and continuing release requirements, **not permission to rerun successful inference gates**. Next focus: separately authorised real-world evidence and release compatibility.

## Phase 0 — Baseline

- Accepted functional TEST target: OpenClaw `2026.10.4`. Development dependency and CI loader smoke remain `2026.9.8`; `2026.9.6` findings are historical.
- Pin Router Core to `5ee7c23c993013a8052588191569db5cf7fb793c`.
- Record the exact installed OpenClaw version for each compatibility run. Never downgrade the owner-accepted 2026.10.4 TEST solely to match older notes.
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

- `/model` selecting GPT-6 Luna
- `/model` selecting GPT-6 Sol
- clearing the manual override back to the default/automatic state
- restarting the plugin/Gateway with a pre-existing persisted selection
- resetting/deleting and recreating a locked session, plus a second isolated session
- yielding when persisted selection state is missing or ambiguous

The router must yield to an explicit manual selection.

**Gate:** no manual selection is silently replaced, including after restart; stale or uncertain session state never authorizes an AUTO override.

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
