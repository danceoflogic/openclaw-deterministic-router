---
title: Comparative research on deterministic and adaptive model routers
date: 2026-10-13
status: research-only
project: danceoflogic/openclaw-deterministic-router
repository_snapshot: main@67497855f7355baf54b08f91ee871bb1218a8ddf
scope: architecture; classification; fallback; isolation; observability; evaluation
change_authorization: none
---

# Comparative research: OpenClaw deterministic router

## Executive assessment

The project's core advantage is **zero-inference, auditable model selection coupled to conservative host/session integration**. Its primary unsolved problem is not yet choosing a cleverer classifier: it is demonstrating that `auto` applies the chosen model safely and only in the intended session on the current tested runtime. Quality and cost optimization should follow that safety gate.

The best improvements found in other systems are (1) a measured, representative offline routing benchmark, (2) separate signals for request difficulty, capability requirements and task risk, (3) explicit handling of ambiguous classifications, (4) host-compatible retry/fallback control, and (5) comparison of selected model with independently observed execution identity.

**Scope caution:** This is a source/repository documentation review, not a live reproduction, benchmark or independent confirmation of competitor performance. Project-specific assertions such as '92 production decisions' are claims from their READMEs. All GitHub files read as of 2026-10-13. The user's Worktop project targets OpenClaw 2026.9.8; their OpenPaw environment reportedly uses 2026.10.1. Do not extrapolate test evidence across versions.

## Current project snapshot

Repository: https://github.com/danceoflogic/openclaw-deterministic-router

- Pinned `@blockrun/router-core` commit `5ee7c23c993013a8052588191569db5cf7fb793c`.
- `src/classifier.ts`: uses `classifyByRules()`, no paid classifier call; approximate prompt token count `ceil(length / 4)`.
- `src/policy.ts`: null classification maps to `ambiguousTier` (default `COMPLEX`); any attachment enforces `minAttachmentTier` (default `MEDIUM`).
- `src/index.ts`: OFF / SHADOW / AUTO; persisted session state read at every routing decision; manual or unknown state suppresses override; selected-only audit; provider-call-level events on embedded path; appropriately limited native-runtime observations; model-call diagnostic subscription uses disposal lifecycle where supported.
- Golden fixtures include genuinely ambiguous short summarization and boundary examples. A keyword-stuffed complex prompt explicitly classifies COMPLEX, but that synthetic fixture is not a robust generalization check.
- Issue #7: controlled AUTO safety and effective-model correlation still blocked; unrelated-session containment and old listener handling remain conditions. Do not repeat existing probes merely for context or run AUTO without separate approval.
- Issue #8: child/subagent independence remains unverified. Issue #9: overhead/telemetry/restart measurements remain pending.

Sources: README, `src/classifier.ts`, `src/policy.ts`, `src/index.ts`, `tests/fixtures/golden-prompts.json`, issues #7/#8/#9.

## Competitor comparison

| Project | Approach | Strong idea to borrow | Trade-off / evidence limit | Source |
|---|---|---|---|---|
| BlockRun ClawRouter / Router Core | The same 15-dimensional deterministic classifier, plus task-shape classification and capability-first model filtering in more recent product layers | Compare null/fallback strategy; hard requirements for tools, vision and context before candidate ranking | Current upstream behavior is not necessarily available in the pinned commit; ClawRouter has gateway/payment-specific architecture | https://github.com/BlockRunAI/ClawRouter/blob/main/docs/configuration.md |
| ghvk12/openclaw-model-router | Heuristic + Qdrant/Ollama semantic kNN; strong agreement for cheapest tier; JSONL WAL; circuit breaker | Offline exemplar test, conservative agreement, counters for false-cheap promotions, log harvesting | Qdrant persistence/embeddings cost resources and adds operational dependency; README's claimed 92 live decisions are not an independent audit | https://github.com/ghvk12/openclaw-model-router |
| OpenMark/openclaw-router | One classifier LLM call to identify task family, then deterministic benchmark-based selection with a viability floor and strategies | Benchmark candidates against **actual tasks**, not arbitrary tiers; filter underperformers; separate observed quality and total cost | Violates zero-inference routing; documented use of direct config/session-state writes and temporary runtime overrides increases integration risk | https://github.com/openmarkai/openclaw-router |
| Zero-Nine-Labs/openclaw-model-router | JEV Decisions API yields typed complexity, clarity, continuation, reference, risk and work-family signals; policy chooses model and reasoning effort | Distinguish continuation/reference needs from length; preserve model pins; avoid rerouting fallback retries; version-pinned compatibility checks | Requires classifier network call; compatibility extensions patch exact OpenClaw bundles 2026.9.3/9.5, not a drop-in for 9.8 or 10.1 | https://github.com/Zero-Nine-Labs/openclaw-model-router |
| LiteLLM Auto Router | Rule/heuristic classifier or optional LLM/JEV classifier; keyword escalation; context window; classifier fallback; shadow evaluation | Low-cost baseline plus optional better classifier only when justified, classifier failure remains separate from execution failure; telemetry for comparative evaluation | Gateway rather than an OpenClaw-native drop-in; hosted classifier modes incur cost and latency | https://docs.litellm.ai/docs/proxy/auto_routing |
| RouteLLM (LMSYS) | Preference-trained pairwise stronger/weaker choice and benchmark/evaluation framework | Measure cost/quality frontiers against simple and strong baselines | Historical published savings are for particular benchmarks/model pairs and must not be projected to Luna/Terra/Sol | https://github.com/lm-sys/RouteLLM |
| vLLM Semantic Router | Explicit signals -> projections -> decisions -> model pools, with policy recipes and isolated runtime state | Clean separation between classification, policy, serving health and telemetry; fits future multiple orchestrators | Full stack is substantially heavier than needed for a single OpenClaw gateway | https://github.com/vllm-project/semantic-router/blob/main/website/docs/overview/semantic-router-overview.md |
| LiteLLM Router (reliability layer) | Per-deployment cooldowns; error-type retry policies; session affinity and hard pre-call checks | Keep endpoint recovery distinct from *logical complexity classification*, cap retry multiplication | Does not itself solve your OpenClaw hook lifecycle or manual-pin behavior | https://docs.litellm.ai/docs/routing |

### Research evidence on routing sophistication

The 2026 **LLMRouterBench** (21 datasets, 33 models, more than 400,000 examples, 10 representative routing approaches) reports many routers with similar performance, several failing to reliably outperform a simple baseline, and gains from carefully curating model choices rather than enlarging the ensemble. This supports **benchmarking before complexity**. Published benchmarks do not evaluate this specific OpenClaw installation or model fleet.

Sources: https://aclanthology.org/2026.findings-acl.1881/ and https://github.com/ynulihao/LLMRouterBench .

## Findings specific to current problems

### F1: Ambiguity may be more expensive than misclassification

The pinned wrapper treats `tier=null` as COMPLEX, which is a legitimate conservative quality default but a potential spend amplifier. The fixture `Summarise this note into three concise bullets.` produces null and therefore COMPLEX; a very similar long repeated version classifies MEDIUM. Upstream ClawRouter documents a MEDIUM default for ambiguous inputs. There is no evidence yet to prefer either globally.

**Proposed test, no live calls:** On representative redacted/synthetic prompts, tally `classifierTier=null` frequency, task type, score/confidence bands, attachment count, and effectiveTier. Compute estimated expensive-tier share with fallback COMPLEX versus MEDIUM and inspect false-cheap risk. A safe next version might choose an ambiguity policy per agent/task, but only after labels and guard tests.

### F2: Complexity is not the same as task requirements

Hard constraints such as tool use, vision, context-window fit, privacy/allowed providers and manual selection are not a weighted preference. Newer ClawRouter filters incapable models before ranking. vLLM Semantic Router separates signals/policy/backends.

**Proposed architectural direction:**
1. **Eligibility and authority**: explicit manual pin, session identity, agent allowlist, permitted providers, host compatibility.
2. **Capability constraints**: attachments/modality, tool support, context limits.
3. **Workload signals**: estimated difficulty, task family, scope, continuation/reference complexity, consequentiality.
4. **Policy**: choose tier/model within eligible candidates and agent budget.
5. **Execution resilience**: host-compatible, bounded fallback/cooldown without reapplying the first override.
6. **Observation**: selected vs applied vs runtime-model/provider-call evidence with no overstatement.

This is a **future architecture sketch**, not authority to expand scope of Issue #7.

### F3: Host fallback interference is a real upstream concern

OpenClaw issue #63139 documents a historical case where `before_model_resolve` fired for every host fallback attempt, reapplying the original model, defeating fallbacks. It affected the reporter's OpenClaw `2026.3.23-2`; the issue was closed as not planned. This does not prove that the same failure exists in Worktop `2026.9.8` or OpenPaw `2026.10.1`.

**Proposed regression:** Use mock host/hook fixtures to simulate multiple attempts sharing logical run identity. Require classification/selection policy not to rewrite a genuine fallback candidate, and classify absence of supported attempt identity as **not proven**, not as permission for a production workaround. Avoid relying on (sessionId,prompt hash,30 s) as a correctness boundary without strong host evidence.

Source: https://github.com/openclaw/openclaw/issues/63139 .

### F4: Manual selection is correctly treated as an authority/safety issue

OpenClaw issue #57313 observes that `before_model_resolve` historically lacks a dedicated pinned-model field; downstream plugins have resorted to direct session-file reads. Your authoritative `getSessionEntry(..., readConsistency:'latest')`, unknown-state fail-closed behavior, and per-session reconciliation are stronger patterns. Do not discard them to simplify the classifier.

Source: https://github.com/openclaw/openclaw/issues/57313 .

### F5: Effective model must not be inferred from selection log

Competitor READMEs sometimes use `override returned` or `routedLive=true` as proof of live model selection. That shows application intent, not necessarily independently observed execution. Your existing `selected-only`, embedded `provider-call`, native `runtime-model` distinction is worth retaining. For native opaque turns, never claim a per-hidden-call identity without a supported event.

Source: project's `docs/model-observability.md`, Issue #7; ghvk12 README.

### F6: Separation of logical routing and provider health/fallback

LiteLLM keeps cooldown, health, per-error retries and bounded fallback counts distinct from model-tier routing. That separation prevents a permanent loop where an initially selected, unhealthy expensive/cheap model is force-reapplied on each retry. Avoid silently escalating to Sol after provider failures; fallback must honor a documented permitted candidate set and cap.

Source: https://docs.litellm.ai/docs/routing .

### F7: Evaluation must measure actual outcomes

A correct synthetic expected-tier fixture does not prove the answer would be good enough, nor that money was saved. RouteLLM and OpenMark provide an important distinction between **classification agreement** and **task-level value**. Score per task family with independent/manual quality labels and actual per-run usage when available; include a cheapest-acceptable-model oracle estimate, clearly labelled as approximate.

## Prioritized actions

| Rank | Action | Value | Effort | Dependencies | Safe acceptance |
|---|---|---|---|---|---|
| P0 | Complete existing #7 safety/effective-model gate before AUTO | Critical | Already in progress | Exact runtime and scoped permission, independent evidence and unrelated-session containment | A/B on disposable sessions; no unexpected writes; independently verified applied identity; shadow restored; preserve genuine control session |
| P0 | Add **offline** regression for fallback attempts overriding host-selected alternative, if semantics can be represented in tests | High | Low-medium | Confirm exact 9.8 / 10.1 hook behavior; no live fallback required at first | No same-run reassertion of primary model over deliberate retry |
| P1 | Build 80-120 example routing evaluation corpus and compare pinned classifier against simple baseline | High | Low-medium | Data hygiene and explicit target labels | Confusion matrix, null rate, false-cheap and false-expensive rates by task family |
| P1 | Quantify ambiguity tax and boundary behavior | High | Low | Existing shadow telemetry / offline fixtures | Evidence-based decision whether default COMPLEX remains justified |
| P1 | Expand regression coverage for short continuations, reference-heavy work, tool-only tasks, multilingual messages, long trivial prompts, prompt-keyword bait, attachments and model pins | High | Low-medium | Offline fixture curation | Determinism plus defined expected policy outcome; version-pinned results |
| P1 | Complete #8 child independence after #7 | Critical to agent hierarchy | Medium | #7 acceptance | Distinct parent/child effective runtime identity and no unapproved high-tier inheritance |
| P2 | Capability-first prefilter / allowed target lists per orchestrator | High long-term | Medium | Model capability inventory; #7/#8 | No incompatible candidate, agent authority preserved |
| P2 | Compare local semantic kNN or optional small classifier in SHADOW only | Conditional | Medium-high | Evaluation corpus proves substantial baseline weakness | Net improvement in task quality and cost after measuring embedding/inference overhead |
| P2 | Adopt measured telemetry distribution, p95 overhead and stale listener tests (#9) | Moderate | Medium | Current lifecycle #7 constraints | Bounded logs, zero prompt leakage, clean startup/shutdown |
| P3 | Provider circuit breaker and dynamic learned selection | Conditional | High | Production usage data; host fallback contract | No hidden escalation, no retry explosion, deterministic explanation |

## Offline evaluation protocol

**Stage A: representative prompts** (no model requests): assemble 80-120 redacted/synthetic cases across routine admin, research, code investigation, agentic multi-step tasks, mathematical proofs, legal-sensitive questions, long pasted logs, short continuations (e.g. 'continue', 'fix that'), attachments, explicit pins and parent/child delegation. Include both genuinely difficult and superficially difficult prompts.

**Stage B: reference policy**: define `minimum_acceptable_tier` and `maximum_justified_tier` using a documented rubric. Keep these normative labels separate from observed output quality, which requires model execution and evaluation. Mark genuinely ambiguous cases instead of forcing false certainty.

**Stage C: replay**: pin classifier hash and host/runtime target. For each case record `case_id`, `task_family`, `token_estimate`, `signals`, `score`, `classifier_tier_or_null`, `confidence_as_router_score_not_calibrated_success_probability`, `attachment_floor`, `effective_tier`, `model`, `policy_reason`.

**Stage D: metrics**: null rate and by-family null rate; under-routing count; over-routing count; REASONING/COMPLEX direct-versus-fallback selection; approximate spend differential under alternative fallback policies; case-level regressions; stable repeated outputs.

**Stage E: optional bounded provider comparison**: only after explicit approval, compare a small stratified subset against output quality, latency, actual cost and tool completion; hold prompts fixed and preserve privacy. No AUTO required for these quality comparisons.

No classification tuning should be accepted on the strength of one synthetic 'direct COMPLEX' example or score threshold alone. Record held-out scores and failure modes.

## Do not copy these patterns blindly

- An LLM call on every request, unless measured improvements exceed classifier cost/latency and privacy implications.
- Persistent `openclaw.json` and session-file writes to simulate per-turn routing when supported host hooks can achieve it. Such writes can interfere with unrelated sessions.
- Runtime-bundle monkey patches without exact hash/version checks, explicit rollback and a clear value that justifies maintenance.
- Treating tier agreement or `applied=true` as proof of effective model usage or quality.
- Assuming newer router features can be transplanted into the pinned BlockRun classifier without dependency review.
- Adding embedding databases before observing substantial heuristic failure.
- Increasing the COMPLEX score boundary just to make a demonstration pass without examining false positive/negative movements.

## Recommended immediate next step

Keep Issue #7's approved engineering scope unchanged; use external research to write **an offline evaluation-plan issue or note** separately. After #7 and #8, run a no-provider-call, no-Gateway-change corpus replay and compare a few alternative policies. Use its results to decide whether the next investment is threshold tuning, task-family rules, kNN, or leaving the current simple deterministic system alone.

## Source index

- Own repo and issues: https://github.com/danceoflogic/openclaw-deterministic-router ; https://github.com/danceoflogic/openclaw-deterministic-router/issues/7 ; https://github.com/danceoflogic/openclaw-deterministic-router/issues/8 ; https://github.com/danceoflogic/openclaw-deterministic-router/issues/9
- BlockRun ClawRouter: https://github.com/BlockRunAI/ClawRouter/blob/main/docs/configuration.md
- ghvk12 router: https://github.com/ghvk12/openclaw-model-router
- OpenMark router: https://github.com/openmarkai/openclaw-router
- Zero-Nine Labs router: https://github.com/Zero-Nine-Labs/openclaw-model-router
- herval JEV gate: https://github.com/herval/openclaw-jev-plugin
- LiteLLM auto routing: https://docs.litellm.ai/docs/proxy/auto_routing
- LiteLLM reliability: https://docs.litellm.ai/docs/routing
- LMSYS RouteLLM: https://github.com/lm-sys/RouteLLM
- vLLM Semantic Router: https://github.com/vllm-project/semantic-router/blob/main/website/docs/overview/semantic-router-overview.md
- LLMRouterBench paper: https://aclanthology.org/2026.findings-acl.1881/
- OpenClaw manual-state issue: https://github.com/openclaw/openclaw/issues/57313
- OpenClaw fallback hook issue: https://github.com/openclaw/openclaw/issues/63139