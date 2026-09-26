# Router acceptance test protocol

This document is the canonical execution protocol for validating the deterministic router on OpenClaw 2026.9.6.

Track progress in [issue #10](https://github.com/danceoflogic/openclaw-deterministic-router/issues/10).

## Principles

1. Prove deterministic properties locally before spending live inference.
2. Observe selected and effective models independently.
3. Keep `shadow` as the safe default until all prerequisite gates pass.
4. Manual user model selection is authoritative.
5. Fail closed when session identity or manual-selection state is uncertain.
6. Test subagents independently from parent turns.
7. Prefer minimal live calls and evidence-rich logs over repeated prompts.
8. Change one variable per test.
9. Record failures as separate issues instead of hiding fixes inside test work.
10. Never log prompts, responses, credentials, raw session keys, or raw provider request IDs.

## Gate A: zero-inference correctness

Issue: [#4](https://github.com/danceoflogic/openclaw-deterministic-router/issues/4)

Build a table-driven local matrix that covers all four effective tiers, ambiguity fallback, attachment promotion, token-size boundaries, and repeated-input determinism.

This gate must make zero LLM or provider API calls.

Pass when:

- all four effective tiers are represented;
- identical input returns identical classification fields;
- ambiguity uses configured fallback;
- attachment policy only promotes;
- tier-to-model mapping is tested independently.

## Gate B: observability and manual-selection safety

Issues:

- [#2 actual model-call telemetry](https://github.com/danceoflogic/openclaw-deterministic-router/issues/2)
- [#3 manual lock restart semantics](https://github.com/danceoflogic/openclaw-deterministic-router/issues/3)

Do not enable AUTO until both pass.

### Actual model telemetry

For the embedded model-call path, use OpenClaw 2026.9.6 `model_call_started` and `model_call_ended` typed hooks to capture sanitized effective provider/model metadata. These hooks are **not emitted by native Codex**. Native Codex's installed bundle also exposes trusted `model.call.*` diagnostics, but they are explicitly `observationUnit: "turn"`; record them as turn-scoped `model_identity_observed` telemetry, not provider-call evidence. Native adapter context remains a weaker run/attempt-scoped signal. `agent_end`, a Codex adapter's resolved model, `llm_input` / `llm_output`, or a turn diagnostic does not independently prove the provider/model actually called per hidden request, retry, or fallback. See [effective-model observability](model-observability.md).

Correlate router decisions and model calls with `runId`; preserve multiple `callId` values when a run contains retries or multiple calls.

Gate B remains open for Codex-backed routes until a supported, call-level observation is demonstrated and tested. A loader smoke test showing hook registration is not live effective-model evidence.

The critical invariant is:

```text
router selected provider/model == OpenClaw effective provider/model
```

for an AUTO-applied decision, unless OpenClaw explicitly reports a documented fallback that the test is designed to exercise.

### Manual selection

The current lock registry is process-local and is populated by `session:patch`. Test a manual selection that exists before router/Gateway restart.

AUTO must not override an explicit persisted model selection merely because the router instance has restarted.

If authoritative state cannot be recovered, yield rather than guess.

## Gate C: minimal live shadow validation

Issues:

- [#5 shadow acceptance](https://github.com/danceoflogic/openclaw-deterministic-router/issues/5)
- [#6 attachment floor](https://github.com/danceoflogic/openclaw-deterministic-router/issues/6)

Keep `mode=shadow`.

Use one known fixture prompt per effective tier. Do not repeat prompts live to prove determinism; Gate A already owns that property.

For each live turn record:

| Field | Expected |
|---|---|
| mode | `shadow` |
| classifierTier | matches local fixture |
| effectiveTier | matches local policy |
| selectedProvider/model | matches configured target |
| manualLock | false unless deliberately testing a lock |
| applied | false |
| runId | present when OpenClaw exposes it |

Recommended live-call budget: 4 to 6 turns.

### Attachment test

Use the same known SIMPLE prompt once without an attachment and once with a tiny harmless document.

With default `minAttachmentTier=MEDIUM`, expect the attached turn to promote SIMPLE to MEDIUM. Also verify a stronger tier is never demoted.

OpenClaw 2026.9.6 provides attachment metadata to `before_model_resolve`, so this is an integration test of the real event path.

## Gate D: bounded AUTO validation

Issues:

- [#7 controlled AUTO](https://github.com/danceoflogic/openclaw-deterministic-router/issues/7)
- [#8 subagent independence](https://github.com/danceoflogic/openclaw-deterministic-router/issues/8)

AUTO is a test condition, not the repository default.

### Ordinary turns

Use the smallest set of known prompts needed to exercise configured target providers/models.

For every AUTO-applied turn verify:

- `applied=true`;
- selected provider/model equals effective provider/model;
- no unexplained fallback or escalation occurs.

### Manual override precedence

While AUTO is enabled:

1. select a model manually;
2. send a prompt that would route elsewhere;
3. require `manualLock=true` and `applied=false`;
4. verify the effective model remains the manual selection;
5. return the session to default selection;
6. verify AUTO resumes.

### Subagents

Create a strong parent task and a deliberately trivial child task.

The child must receive an independent routing decision if OpenClaw invokes `before_model_resolve` independently for that child.

OpenClaw 2026.9.6 also exposes per-plugin subagent model-override trust settings. Determine from runtime evidence whether these controls apply to the router's hook-based override path before changing config. If a permission is required, use the narrowest explicit model allowlist.

Do not use `allowedModels: ["*"]` without a documented need.

## Gate E: operational efficiency

Issue: [#9](https://github.com/danceoflogic/openclaw-deterministic-router/issues/9)

Measure instead of guessing.

Benchmark at least 1,000 local classifications across representative prompt sizes and record:

- mean latency;
- p50 latency;
- p95 latency;
- process memory delta;
- log volume per 100 decisions.

Confirm:

- zero model/API calls from classification;
- no prompt or raw session data in telemetry;
- idle Gateway restart does not produce router-specific stuck work.

Do not optimize config parsing, hashing, UUID generation, or logging unless measurements show they matter.

### Release compatibility and reproducibility

Issue: [#12](https://github.com/danceoflogic/openclaw-deterministic-router/issues/12)

Before the first release, align the declared OpenClaw compatibility range with versions that have actually passed the loader and acceptance gates. Also make the lockfile/dependency reproducibility policy explicit.

## OpenClaw work procedure

For each issue:

1. pull current `main`;
2. create a dedicated branch;
3. make the smallest change or run the smallest test that satisfies the issue;
4. run `npm run check`;
5. run the OpenClaw 2026.9.6 runtime-loader smoke test when plugin registration changes;
6. keep generated `package-lock.json` uncommitted unless lockfile adoption is deliberate;
7. open a focused PR;
8. add concise evidence to the issue;
9. merge only after CI is green;
10. move to the next gate only when prerequisites are satisfied.

If a new defect appears, open a separate issue and stop the affected gate.

## Final acceptance

AUTO rollout is eligible for a deliberate release decision only when all of the following are demonstrated:

- deterministic local classification;
- correct policy mapping;
- selected/effective provider-model correlation;
- manual selection protection across restart and session reset/deletion;
- shadow-mode integration;
- attachment-floor integration;
- AUTO application;
- manual override precedence;
- independent subagent behavior;
- no unexplained Sol escalation;
- verified `shadow` and `off` kill-switch behavior;
- acceptable measured overhead;
- compatibility metadata that matches tested evidence and an explicit dependency reproducibility policy.

Until then, keep `shadow` as the operational default.
