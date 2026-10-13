# ADR 0002: Separate routing authority, capability, selection, execution and evaluation

- **Status:** accepted as an architectural direction; implementation and runtime acceptance pending
- **Date:** 2026-10-13
- **Related:** [ADR 0001](0001-pin-router-core.md), [architecture](../architecture.md), [comparative research](../openclaw-router-comparative-research-2026-10-13.md), [AUTO gate #7](https://github.com/danceoflogic/openclaw-deterministic-router/issues/7), [subagent gate #8](https://github.com/danceoflogic/openclaw-deterministic-router/issues/8)

## Context

The current router uses a pinned zero-inference BlockRun classifier to choose one of four complexity tiers, maps the resulting tier to a configured model, and applies the choice only if its OpenClaw session-safety checks permit it. `off`, `shadow`, and `auto` modes, persisted manual-selection reconciliation, and separate runtime-observation evidence already exist.

Comparative research highlighted four design risks that become more expensive to fix after AUTO and multi-agent routing are established:

1. a model-resolution hook may also execute during a host retry/fallback, so a fresh initial override could defeat the host's recovery attempt;
2. an apparently easy task may need capabilities or permissions that the model assigned to its tier lacks;
3. a single global tier-to-model mapping will not necessarily suit different OpenClaw agents and orchestrators;
4. selected tier, applied override, independently observed runtime model, and eventual answer quality are different facts.

The research is an architectural input, **not evidence that any competitor design works on our runtime**. In particular, historical OpenClaw fallback reports do not establish a defect in the current 2026.9.8 target.

## Decision

### 1. Keep initial routing separate from execution recovery

The router owns **initial eligible model selection**. The host/runtime owns the mechanics of attempting calls, retrying, and recovering from provider failures, subject to the user's manual selection, agent permissions, configured restrictions, and explicit fallback policy.

- A repeated hook invocation must not automatically be treated as a new independent classification opportunity.
- A router's original preference must not silently overwrite a legitimate, policy-permitted host fallback attempt.
- No fallback may silently escalate to Sol or another otherwise disallowed target.
- Before implementing special retry behavior, establish what attempt/run identity and hook semantics the **specific installed OpenClaw version** supports. If the distinction cannot be established, mark the behavior **unverified** and do not invent correctness from prompt hashes, arbitrary time windows, or process-local guesses.
- Preserve existing strict session/manual-selection precedence and fail-closed behavior. This decision does **not** authorise modifying host retry behavior, plugin hooks or deployment settings now.

### 2. Separate hard model eligibility from soft workload suitability

**Eligibility** answers whether a model may and can serve a request. It includes authoritative manual selection, agent/provider permissions, known capability requirements (such as required tools, modality and context fit), and applicable host compatibility constraints. A requirement that cannot be verified must not be assumed satisfied for AUTO.

**Suitability** ranks eligible alternatives based on the classifier's complexity estimate and configurable policy. The four existing tiers remain `SIMPLE`, `MEDIUM`, `COMPLEX`, and `REASONING`.

- Complexity tier alone does not guarantee support for vision, tools, context length or a specific permitted provider.
- The existing attachment-tier floor remains a useful *current* heuristic, **not** a capability certificate.
- The design should eventually allow a capability inventory and per-agent allowed targets without coupling those properties to BlockRun scoring.
- Do not replace or expand `ModelTarget` or rewrite the classifier in this ADR. Any future implementation requires a model-capability source, a policy contract and tests for unknown/unsupported capabilities.

### 3. Make agent policy an explicit future boundary, not an orchestration feature

OpenClaw/orchestrators decide **which agent owns the task**. The router chooses an eligible model *for that already-selected agent*. It does not launch agents, borrow access to other workspaces, or infer delegation authority.

- The eventual policy input should support explicit agent identity, associated session/run identity, and a resolved policy identity/version.
- An agent-specific mapping, allowlist or budget can override a global routing *default* only after explicit configuration and authority checks; it cannot override a manual user model choice or broader restrictions.
- Unrecognised, unavailable or ambiguous agent identity must not grant access to a broader model/provider set.
- Keep today's single global tier mapping unchanged until independent parent/child routing and effective model identity are demonstrated in [#8](https://github.com/danceoflogic/openclaw-deterministic-router/issues/8) after the ordinary AUTO gate [#7](https://github.com/danceoflogic/openclaw-deterministic-router/issues/7).
- A cross-orchestrator task remains subject to the actual delegated agent's permissions; routing never confers cross-agent authority.

### 4. Keep evaluation and runtime evidence distinct from classification

Record and evaluate separate stages, without conflating them:

| Stage | Meaning | Present or future evidence |
| --- | --- | --- |
| Classifier result | Direct `classifierTier` (including `null`), score, signals, **uncalibrated** confidence | Existing local classifier |
| Policy resolution | `effectiveTier`, applied floors/fallbacks, selected provider/model and reason | Existing decision records; future explicit policy identity |
| Override result | Whether this router attempted to apply an override, or yielded to a manual/unknown session state | Existing `applied`/manual-lock audit, not proof of execution |
| Runtime observation | Independently observed identity at the runtime's **declared evidence scope** | Existing `provider-call` on embedded path or narrower `runtime-model` on native turn/run path |
| Answer quality / cost | Whether a model completed the task sufficiently and at what actual cost | **Not established** by classification or selected-model logs; requires separate labelled evaluation |

A native opaque turn is not evidence of each hidden provider request/retry. Preserve the existing run/call correlation semantics and do not relabel selected-only or turn-level metadata as provider-call proof.

Before substantial classifier tuning, build a representative redacted/synthetic offline corpus with reference labels and separate quality-evaluation criteria. Measure direct versus ambiguous classification, under/over-routing by task family, and possible cost trade-offs. Reference tiers are human policy judgements, **not** validated model-answer quality. Do not tune thresholds merely to make one synthetic direct-COMPLEX fixture pass.

## Boundaries and sequencing

**This ADR records design intent only.** It makes **no** change to code, model mapping, `ambiguousTier=COMPLEX`, operational modes, OpenClaw configuration, sessions, live telemetry, or test authorisation.

| When | Allowed follow-up | Not implied or authorised |
| --- | --- | --- |
| Now, documentation/offline only | Preserve these interfaces as separate conceptual concerns; add an offline evaluation plan or mock retry regression when host semantics are understood | Runtime invocation, paid probe, AUTO activation, restarting/deploying Gateway |
| Before #7 live acceptance | Check version-specific fallback-hook semantics alongside existing isolation/readiness requirements; use independently observed applied/effective model evidence and explicit approval for any scoped live test | Repeating already-completed controls, altering unrelated sessions, widening approved probes |
| After #7, for #8 | Verify parent/child decisions and effective identities independently; establish actual subagent override permissions | Assuming child inherits a valid routing contract from parent |
| After #7/#8 | Consider adding explicit capability filtering and agent-specific policy configuration with backward-compatible defaults | Automatic expansion of model/provider permissions |
| After representative offline evaluation | Compare ambiguity policy, thresholds, and possibly semantic classification against pinned baseline | Changing to a network/LLM classifier or an embedding database without measured value |

Version evidence is not portable by assumption: Worktop `2026.9.8` observations and reported OpenPaw `2026.10.1` usage must be validated independently before claiming compatibility.

## Invariants to protect in later implementation

- **Manual selection wins;** missing or malformed authoritative state never permits an AUTO override.
- **No cross-session or cross-agent spillover;** work outside explicitly approved test scope is unchanged.
- **No silent escalation;** effective fallback targets must remain authorised and explainable.
- **Correct recovery ownership;** a host retry must not be forcibly redirected to the initial failed candidate.
- **No false observability claims;** selection, application, runtime identity and answer quality stay separately labelled.
- **No routing inference overhead by default;** the baseline remains local and deterministic.
- **No raw sensitive payloads in audit;** preserve prompt-free structured records and hashed session identifiers.

These are architectural acceptance objectives, not claims that each is already proven.

## Consequences

- Existing four-tier classifier and global configuration can remain in place while the safety gates finish.
- Future capability checks and agent-specific policies gain a defined home without turning the router into an orchestrator.
- Fallback handling needs runtime-specific evidence rather than generic retry assumptions.
- Offline benchmarking precedes cost/quality optimisation, avoiding unnecessary classifier dependencies.
- Some interfaces may require later extension, but this ADR deliberately avoids inventing unsupported OpenClaw hooks or changing production behavior prematurely.

## Alternatives considered

- **Keep a single tier-to-model mapping forever:** simpler today, but entangles model suitability with capability and agent restrictions.
- **Let the router own all retries:** risks conflicting with OpenClaw fallback handling, manual precedence and failure controls.
- **Replace BlockRun immediately with a semantic or LLM classifier:** adds cost, latency, operational dependencies and an unmeasured quality benefit.
- **Infer successful execution from `applied=true`:** cannot establish which model the runtime used.

None of these alternatives is adopted.

## References

- [Comparative research, 2026-10-13](../openclaw-router-comparative-research-2026-10-13.md)
- [Existing model observability contract](../model-observability.md)
- [Implementation plan](../implementation-plan.md)
- [OpenClaw AUTO acceptance issue #7](https://github.com/danceoflogic/openclaw-deterministic-router/issues/7)
- [OpenClaw independent subagent issue #8](https://github.com/danceoflogic/openclaw-deterministic-router/issues/8)
