# Router acceptance test protocol

This is the canonical acceptance protocol. **Current TEST acceptance target (owner-approved 2026-10-17): OpenClaw 2026.10.4.** Historical observations on 2026.9.8 and 2026.9.6 remain version-labelled, not current TEST requirements. The 2026-10-17 Issue #7 evidence-policy amendment below supersedes older requirements wherever they conflict.

Track progress in [issue #10](https://github.com/danceoflogic/openclaw-deterministic-router/issues/10).

## Principles

1. Prove deterministic properties locally before spending live inference.
2. For Issue #7 functional acceptance, observe OpenClaw's model-selection state and router behaviour; external provider-model confirmation is a separately tracked check, not a prerequisite for the functional gate.
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

**Scope clarification (owner decision, 2026-10-17):** Issue #2 telemetry capabilities and their verification levels remain documented, but **Issue #7 functional testing does not require collecting native Codex `model.call.completed`, provider-call, or a new `selectionReceipt` as a pass condition**. Use the existing OpenClaw/router session, decision and completed-turn records. Do not turn a missing native diagnostic into an infrastructure-research blocker; independent upstream-model confirmation is deferred to the owner's logs.

### Actual model telemetry

For the embedded model-call path, use OpenClaw 2026.9.6 `model_call_started` and `model_call_ended` typed hooks to capture sanitized effective provider/model metadata at `verificationLevel: "provider-call"`. These hooks are **not emitted by native Codex**. Native Codex's installed bundle also exposes trusted `model.call.*` diagnostics, but they are explicitly `observationUnit: "turn"`; record them as turn-scoped `model_identity_observed` telemetry at `verificationLevel: "runtime-model"`, not provider-call evidence. Native `agent_end` context is a weaker run-scoped runtime-model signal. `agent_end`, `llm_input` / `llm_output`, or a turn diagnostic does not independently prove the provider/model used for every hidden request, retry, or fallback. See [effective-model observability](model-observability.md).

Correlate router decisions and model calls with `runId`; preserve multiple `callId` values when a run contains retries or multiple calls.

Issue #2 does not require native Codex provider-call telemetry that the runtime does not expose. Its native acceptance criterion is the tested, explicitly labelled `runtime-model` observation and documentation of the turn/run limitation. The loader smoke test proves registration; it does not upgrade runtime-model evidence to provider-call evidence. The overall Gate B remains subject to Issue #3 and its separate manual-selection safety checks, and this protocol does not authorize enabling AUTO.

For an embedded provider-call observation, the critical invariant is:

```text
router selected provider/model == OpenClaw effective provider/model
```

for an AUTO-applied decision, unless OpenClaw explicitly reports a documented fallback that the test is designed to exercise. For native `runtime-model` observations, compare selected and resolved fields at the guaranteed run/turn scope and do not infer per-hidden-request equality.

For a controlled acceptance run, OpenAI model-usage data may be compared by time window and model as an aggregate sanity check. It is not exact per-`runId` correlation; see [effective-model observability](model-observability.md).

### Manual selection

The lock registry is only a process-local cache. Before every routing decision, the plugin reconciles the current session through OpenClaw 2026.9.6's authoritative `api.runtime.agent.session.getSessionEntry({ sessionKey, agentId, readConsistency: "latest" })` surface; `session:patch` is an immediate-update fast path. Test a manual selection that exists before router/Gateway restart, then issue a turn without changing the model.

AUTO must not override an explicit persisted model selection merely because the router instance has restarted. Returning the session to `/model default` (or the current equivalent) must produce a persisted entry with no active override, clear protection, and allow AUTO to resume. Exercise two session keys in parallel, then reset/delete one and recreate or reuse its identity; the other session's lock must remain isolated, and stale state must not suppress or authorize AUTO for the reset/deleted session.

If the authoritative entry is missing, malformed, or internally ambiguous, remove any stale cache entry and yield rather than guess. A normal persisted entry with no override is a known default/automatic state and may resume AUTO.

## Gate C: minimal live shadow validation

Issues:

- [#5 shadow acceptance](https://github.com/danceoflogic/openclaw-deterministic-router/issues/5)
- [#6 attachment floor](https://github.com/danceoflogic/openclaw-deterministic-router/issues/6)

Keep `mode=shadow`.

**Current evidence (2026-10-11):** #5 is closed. The real Worktop 2026.9.8 document matrix for #6 passed after the two-hook fix: SIMPLE with a document was promoted to MEDIUM, attached REASONING was not demoted, and telemetry contained structural metadata only. The fix was merged in PR #22 and #6 is closed. This shadow result does not establish AUTO application or provider-call identity.

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

The pinned OpenClaw 2026.9.6 and live Worktop 2026.9.8 builds construct `before_model_resolve.attachments` from images only. For Gateway document uploads, Worktop stages non-image media facts on `reply_dispatch` before model resolution. The router correlates that event by run ID and session key, retains only attachment kinds/count and a classification of `BodyForCommands` (the original user text), and merges it with image metadata at `before_model_resolve`. This avoids classifying the media marker appended to the projected prompt. A plugin-level test checks this two-hook contract; the real Worktop 2026.9.8 Gateway document turn produced the expected shadow audit result. Keep the source-integration and issue-closure status separate from that behavioural result. Do not substitute a filename mentioned in text or an image-only test for the real document test.

## Gate D: bounded AUTO validation

Issues:

- [#7 controlled AUTO](https://github.com/danceoflogic/openclaw-deterministic-router/issues/7)
- [#8 subagent independence](https://github.com/danceoflogic/openclaw-deterministic-router/issues/8)

### Owner decision — 2026-10-17: proportionate functional acceptance

**Current TEST target:** the updated OpenClaw 2026.10.4 environment is accepted. Do not revert simply because earlier evidence and instructions refer to 2026.9.8. Keep production separate. PR #36 remains an unmerged implementation candidate until separately reviewed.

Issue #7 has **two explicitly distinct outcomes**:

1. **Functional routing acceptance (blocking Issue #7's functional gate):** authenticate a genuine ordinary TEST Control UI turn; establish the operator's model choice and agent-scoped persisted selection where applicable; examine the router's classifier, `manualLock`, `applied`, and requested selection; and confirm OpenClaw reports the turn completed. Capture available model/session/run identifiers or bounded timestamps using the existing records. OpenClaw's documented selection and resolved-model reporting can be accepted as the runtime's representation of execution. This does **not** establish the identity of every upstream provider request.
2. **Independent provider-model verification (non-blocking follow-up):** the owner can inspect **turn-level model accounting in their own OpenAI logs**. Where those records genuinely identify and associate a specific completed test turn and model, report that turn-level association; where they are only time-window totals, report aggregate evidence. Never invent correlation or claim a provider-level result before the logs are reviewed. A discrepancy is actionable and may reopen acceptance.

**Do not require** native Codex `model.call.completed`, per-provider-request or `selectionReceipt` receipts, exact in-memory bundle hashing, or new observability instrumentation solely to pass the functional A/B gate. Existing telemetry remains useful when available, but absence of a separately corroborating native diagnostic is not itself a failure. A router `applied=true` value alone is **not** proof of upstream model execution. Record observations at their actual evidence level.

### Minimal owner-assisted TEST sequence

Prefer a human-created, attributed TEST Control UI session. Do not bypass session ownership guards or use unsupported CLI agent-exec routes. If operator interaction is needed, ask once for the exact small UI action rather than spending inference on preparatory research.

- **A / shadow preparation:** one short TEST turn, if needed, to verify a genuine attributed UI turn and existing router audit. Confirm mode remains `shadow` and no override is applied. Treat a failed connection/ownership check as a concrete blocker to address, not a reason to repeat completed offline SDK tests.
- **A / manual precedence in bounded AUTO:** choose `openai/gpt-6-sol` explicitly in ordinary session A; confirm OpenClaw's agent-scoped saved user override. Use an unambiguous SIMPLE prompt; require router `manualLock=true`, `applied=false` and ordinary turn completion. The router must not replace a genuine manual selection.
- **B / automatic routing in bounded AUTO:** in a separate ordinary session B with configured/default Sol and **no user override**, use the same SIMPLE prompt; require router `manualLock=false`, SIMPLE tier, selected `openai/gpt-6-luna`, `applied=true`, and completed OpenClaw turn. Where provided, record OpenClaw's resolved model separately from the requested selection; missing external Codex provider receipts are not a test failure.
- **Clear and recheck:** remove the manual model choice using the supported UI/default action; establish that the lock cleared and a subsequent eligible turn resumes AUTO.
- **Safety and isolation:** preserve the exact session allowlist, agent scope, fail-closed unknown-state handling and independent A/B isolation. Check `shadow` and `off` behaviour under the existing protocol, then **restore and verify `shadow`** even after failures. Lifecycle/reset/recreation testing is a separate acceptance item and must not be silently marked passed by A/B.

Keep turns short and bounded by the owner's approved TEST window; **count any bootstrap inference toward its ceiling**, with no automatic retries. Never infer an approval for further calls from this documentation edit. No production deployment, general AUTO rollout, or GitHub merge is authorised by this protocol change. Record PASS/FAIL/INCONCLUSIVE for each functional case and the independent-model-check status separately.

**Execution focus:** run the next permitted human-assisted TEST turn, inspect what happened, correct a demonstrated failure, and continue. Do not repeat successful offline synthetic scoped-selection tests or commission redundant Sol/Luna reviews in place of execution.

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
5. run the OpenClaw 2026.9.8 runtime-loader smoke test when plugin registration changes;
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
- OpenClaw routing decision and reported completion/resolved-model consistency for functional acceptance, with independently confirmed upstream model use recorded separately when owner-side turn-level logs are available;
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
