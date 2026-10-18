# OpenClaw Deterministic Router

[![CI](https://github.com/danceoflogic/openclaw-deterministic-router/actions/workflows/ci.yml/badge.svg)](https://github.com/danceoflogic/openclaw-deterministic-router/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

A local, deterministic and auditable model-routing plugin for OpenClaw.

The project is designed for one job: **route each eligible OpenClaw turn to an explicitly configured model without spending an LLM call to decide which model should answer.**

> **Project status (18 October 2026):** experimental / shadow-first. On isolated **OpenClaw 2026.10.4 TEST**, bounded ordinary-turn checks passed and Issue #8's existing-child per-agent-turn routing passed. A new first-turn direct-child grant is implemented offline in draft PR #40 but has **not** had live acceptance; provider-request accounting remains deferred. Issue #7's lifecycle and unknown-state checks remain tracked separately. No production AUTO rollout is implied. See [current progress](PROGRESS.md).

## Why this exists

OpenClaw can run different providers and model tiers, but inherited/default model state can make a cost-control strategy surprisingly opaque. This plugin makes routing a visible deterministic policy:

```text
incoming turn
    │
    ▼
local 15-dimension classifier
    │
    ├── SIMPLE ─────► configured cheap worker
    ├── MEDIUM ─────► configured routine model
    ├── COMPLEX ────► configured stronger model
    └── REASONING ──► configured reasoning model
```

The initial model policy used by this repository is:

| Tier | Provider | Model | Desired thinking effort |
|---|---|---|---|
| SIMPLE | OpenAI | `openai/gpt-6-luna` | Low |
| MEDIUM | OpenAI | `openai/gpt-6-luna` | Medium |
| COMPLEX | OpenAI | `openai/gpt-6-sol` | Medium |
| REASONING | OpenAI | `openai/gpt-6-sol` | High |

Every target is configurable. Thinking effort is recorded as policy intent only: this router currently supports provider/model overrides, so per-tier effort enforcement is deferred to [Issue #35](https://github.com/danceoflogic/openclaw-deterministic-router/issues/35).

## Design goals

- **Zero-inference routing.** Routing itself does not call an LLM.
- **Deterministic decisions.** Identical classifier inputs produce identical classifier outputs.
- **Shadow-first rollout.** Observe decisions before allowing overrides.
- **Manual choice wins.** The router is designed to yield when a session has an explicit model selection.
- **Fail closed.** If required session identity or authoritative persisted model-selection state is unavailable, automatic override is skipped.
- **Auditable operation.** Decisions are emitted as structured JSON without storing the raw prompt.
- **Policy separate from classification.** Model mappings can change without changing classifier logic.
- **Reproducible provenance.** The classifier dependency is pinned to an immutable upstream commit.

Architectural direction and implementation boundaries are recorded in [ADR 0002: Routing authority, eligibility, fallback and evaluation](docs/decisions/0002-routing-boundaries-and-evaluation.md). This is a future design contract, **not** a claim that AUTO or multi-agent routing has passed acceptance.

## Router Core provenance

Classification uses the rule-based classifier from [`@blockrun/router-core`](https://github.com/BlockRunAI/router-core), pinned to:

```text
5ee7c23c993013a8052588191569db5cf7fb793c
```

At that revision, Router Core exposes a local weighted classifier across 15 dimensions. This project calls `classifyByRules()` directly and deliberately does **not** invoke the optional LLM fallback for ambiguous cases. Ambiguity is instead handled by an explicit deterministic policy.

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and [ADR 0001](docs/decisions/0001-pin-router-core.md).

## Safe operating modes

### `off`

No classification and no override.

### `shadow` (default)

Classify and log what *would* have been selected, but return no model/provider override to OpenClaw.

### `auto`

Apply `providerOverride` and `modelOverride` from `before_model_resolve`, subject to the persisted-selection and session-identity guards.

`auto` is intentionally not the default.

## OpenClaw compatibility

| OpenClaw version | Status |
|---|---|
| `2026.10.4` | Isolated TEST runtime for the bounded Issue #7 functional routing checks; this is not a blanket compatibility or rollout claim for `main` |
| `2026.9.8` | Committed development dependency target; historical Worktop shadow attachment behaviour verified |
| `2026.9.6` | Historical baseline; retained as the declared minimum, not the current validation target |
| Other versions | Re-run the hook compatibility gates before enabling `auto` |

The development dependency and build metadata still target OpenClaw `2026.9.8`; the later 2026.10.4 TEST results do not change those committed fields. The declared `>=2026.9.6 <2027` range is not a blanket claim that AUTO has passed on every release in that range; issue #12 tracks tightening it before release. The router deliberately treats host-version compatibility as an integration gate because model/session hook contracts can evolve independently of the deterministic classifier.

## Installation for development

Prerequisites for the current OpenClaw 2026.9.8 target:

- Node.js `24.16.0+` on the Node 24 line (CI uses `24.19.0`)
- npm `11.6.0` for reproducible CI dependency resolution

```bash
git clone https://github.com/danceoflogic/openclaw-deterministic-router.git
cd openclaw-deterministic-router
npm install
npm run check
```

Link the plugin into a development OpenClaw installation:

```bash
openclaw plugins install --link . --force
openclaw plugins enable deterministic-router
```

Non-bundled conversation hooks require OpenClaw permission for conversation access. Merge the example in [`examples/openclaw.config.example.json`](examples/openclaw.config.example.json) into the target configuration.

Then inspect the loaded runtime:

```bash
openclaw plugins inspect deterministic-router --runtime --json
```

Start in `shadow` mode.

## Configuration

The native OpenClaw manifest includes a strict JSON schema. Key options:

| Option | Default | Meaning |
|---|---|---|
| `mode` | `shadow` | `off`, `shadow`, or `auto` |
| `ambiguousTier` | `COMPLEX` | deterministic fallback when Router Core returns no confident tier |
| `protectManualSelection` | `true` | yield for an authoritative persisted session override; fail closed when that state is unknown |
| `requireSessionKeyForAuto` | `true` | skip auto override when the session cannot be identified |
| `autoSessionKeyHashes` | `[]` | SHA-256 hex digests of exact session keys permitted to receive AUTO overrides |
| `autoSpawnParentGrants` | `[]` | Opt-in, exact parent key hash + session ID + lifecycle revision + human creator profile ID; only verified same-agent direct children of that incarnation can receive first-turn AUTO routing |
| `minAttachmentTier` | `MEDIUM` | deterministic floor for turns with attachments |
| `models` | see table above | tier-to-provider/model policy |

The Gateway method `deterministic-router.status` is registered with
`operator.read` scope and explicit `profileAccess: "independent"`: this global
process-local snapshot requires no authenticated user profile, while the
operator scope check remains mandatory. It reports a fresh UUID registration
ID that does not reset across separately evaluated module generations, the active
registration's captured effective mode, safeguards and allowlist count. If
the registration has no configuration object, it reports `status: "unknown"`
and null effective fields rather than asserting a mode. Use it alongside
OpenClaw's authored/applied revision fields; the method does not expose session
keys or their hashes and does not change configuration. Both authorization
lists default to empty, so AUTO remains inert until explicitly scoped.

## Telemetry

Each decision is logged as one JSON object containing fields such as:

```json
{
  "decisionId": "...",
  "mode": "shadow",
  "classifierTier": "MEDIUM",
  "effectiveTier": "MEDIUM",
  "score": 0.12,
  "confidence": 0.81,
  "selectedProvider": "openai",
  "selectedModel": "gpt-6-luna",
  "verificationLevel": "selected-only",
  "manualLock": false,
  "applied": false
}
```

Raw prompts are not written to the audit record. Session keys are hashed before logging.

On the embedded model-call path, the router also records sanitized `model_call_started` / `model_call_ended` events with `verificationLevel: "provider-call"`, the selected target, and the effective provider/model per call. Native Codex may additionally expose trusted `model.call.*` diagnostics, but OpenClaw marks them `observationUnit: "turn"`; the router records those with `verificationLevel: "runtime-model"`, `resolved*` fields, and synthetic turn `callId` semantics. Native run/turn observations do not verify provider calls per hidden request, retry, or fallback; that limitation is documented and is not misrepresented as provider-call evidence. See [effective-model observability](docs/model-observability.md) for the runtime-specific guarantee and the aggregate usage cross-check protocol.

## Important OpenClaw integration boundary

`before_model_resolve` is the correct typed hook for deterministic provider/model override, but persisted per-session model state is not directly exposed as a dedicated field in that hook context. On the tested 2026.9.6 baseline and 2026.9.8 Worktop build, the plugin reconciles the current session through the trusted `api.runtime.agent.session.getSessionEntry({ sessionKey, agentId, readConsistency: "latest" })` surface before every routing decision. The internal `session:patch` adapter remains a fast path; authoritative reconciliation also covers plugin/Gateway restart, session reset/deletion, recreated session keys, and model changes made before the router starts. Missing or ambiguous persisted state fails closed rather than reusing a stale process-local lock.

The implementation plan explicitly tests this before production `auto` mode.

## Functional beta milestone

A basic functional beta means the following have been demonstrated on the current OpenClaw target; it does **not** mean AUTO is the default or that a public release is ready:

| Gate | Current evidence | Remaining work |
|---|---|---|
| Deterministic local policy and shadow integration | #2–#5 completed; real document attachment floor passed on Worktop and its fix merged in PR #22 | #6 is closed; #10 now records the completed shadow gate |
| Bounded ordinary-turn AUTO (#7) | TEST functional A/B, clear-to-default, `shadow`, and `off` passed; #7 remains open | Live lifecycle/reset/deletion/recreation and unknown-state fail-closed checks; owner-side provider accounting is separate |
| Independent child routing (#8) | Existing-child per-agent-turn routing passed on isolated TEST; see [evidence](docs/issue8-child-routing.md) | Newly added first-turn parent-incarnation grant needs separate live TEST acceptance; provider-request accounting remains deferred |

After the bounded AUTO tests, restore `shadow`. Release readiness adds measured overhead/restart behaviour (#9), a defensible compatibility and dependency policy (#12), and the remaining [acceptance tracker](https://github.com/danceoflogic/openclaw-deterministic-router/issues/10) checks. See [current progress](PROGRESS.md) and [blockers](BLOCKERS.md) for the evidence boundaries.

## Development roadmap

1. Freeze and verify the pinned classifier baseline.
2. Validate hook event/context shape on the target OpenClaw version.
3. Verify manual `/model` protection.
4. Verify subagent behavior independently from the parent model.
5. Compare routing decisions with the effective runtime model.
6. Run shadow mode against representative real workloads.
7. Enable controlled `auto` mode only after the gates pass.

See [`docs/implementation-plan.md`](docs/implementation-plan.md), the executable [`router acceptance test protocol`](docs/acceptance-test-protocol.md), and the [external operator TEST acceptance runner](docs/operator-acceptance-runner.md).

## Comparative research

The [comparative model-router research (13 October 2026)](docs/openclaw-router-comparative-research-2026-10-13.md) reviews related projects and research, including classification ambiguity, capability-aware selection, host fallback behavior, session safety, and an offline evaluation plan. It is a **research note**, not implementation approval or evidence that AUTO is ready.

## Security

Native OpenClaw plugins run inside the Gateway process. Review plugin code before installation and do not place credentials in this repository or its config examples. See [SECURITY.md](SECURITY.md).

## Contributing

Issues and focused pull requests are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) first.

## License

This project is licensed under the **Apache License, Version 2.0**, which allows reuse, modification, and commercial distribution subject to its conditions. When redistributing this software or qualifying derivative works, retain the relevant attribution from [NOTICE](NOTICE) as required by Apache-2.0 Section 4(d). This acknowledgement identifies the original developer, Chris Davison, and the [original project](https://github.com/danceoflogic/openclaw-deterministic-router). The licence does not require a credit on a product homepage or in advertisements.

**Earlier MIT-licensed versions stay MIT-licensed.** This change does not revoke permissions previously granted under MIT.

Router Core remains separately copyrighted by BlockRun and MIT licensed. See [LICENSE](LICENSE), [NOTICE](NOTICE), and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
