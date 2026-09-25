# OpenClaw Deterministic Router

[![CI](https://github.com/danceoflogic/openclaw-deterministic-router/actions/workflows/ci.yml/badge.svg)](https://github.com/danceoflogic/openclaw-deterministic-router/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A local, deterministic and auditable model-routing plugin for OpenClaw.

The project is designed for one job: **route each eligible OpenClaw turn to an explicitly configured model without spending an LLM call to decide which model should answer.**

> **Project status:** experimental / shadow-first. `shadow` is the default mode. The current development and integration target is **OpenClaw 2026.9.6**. Automatic model overrides should only be enabled after the integration gates in the implementation plan pass on the target runtime.

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

| Tier | Provider | Model |
|---|---|---|
| SIMPLE | Telnyx | `MiniMaxAI/MiniMax-M3-MXFP8` |
| MEDIUM | OpenAI | `gpt-5.6-luna` |
| COMPLEX | OpenAI | `gpt-5.6-terra` |
| REASONING | OpenAI | `gpt-5.6-sol` |

Every target is configurable.

## Design goals

- **Zero-inference routing.** Routing itself does not call an LLM.
- **Deterministic decisions.** Identical classifier inputs produce identical classifier outputs.
- **Shadow-first rollout.** Observe decisions before allowing overrides.
- **Manual choice wins.** The router is designed to yield when a session has an explicit model selection.
- **Fail closed.** If required session identity is unavailable, automatic override is skipped.
- **Auditable operation.** Decisions are emitted as structured JSON without storing the raw prompt.
- **Policy separate from classification.** Model mappings can change without changing classifier logic.
- **Reproducible provenance.** The classifier dependency is pinned to an immutable upstream commit.

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
| `2026.9.6` | Current development and integration target |
| `< 2026.9.6` | Not supported by the current baseline |
| `> 2026.9.6` | Re-run the hook compatibility gates before enabling `auto` |

The package is compiled and tested against OpenClaw `2026.9.6`. The router deliberately treats host-version compatibility as an integration gate because model/session hook contracts can evolve independently of the deterministic classifier.

## Installation for development

Prerequisites for the current OpenClaw 2026.9.6 target:

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
| `protectManualSelection` | `true` | conservatively yield when a persisted session model selection is tracked |
| `requireSessionKeyForAuto` | `true` | skip auto override when the session cannot be identified |
| `minAttachmentTier` | `MEDIUM` | deterministic floor for turns with attachments |
| `models` | see table above | tier-to-provider/model policy |

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
  "selectedModel": "gpt-5.6-luna",
  "manualLock": false,
  "applied": false
}
```

Raw prompts are not written to the audit record. Session keys are hashed before logging.

## Important OpenClaw integration boundary

`before_model_resolve` is the correct typed hook for deterministic provider/model override, but persisted per-session model state is not directly exposed as a dedicated field in that hook context. This project therefore isolates selection tracking behind a `session:patch` adapter and treats that behavior as an integration gate to verify on each target runtime.

The implementation plan explicitly tests this before production `auto` mode.

## Development roadmap

1. Freeze and verify the pinned classifier baseline.
2. Validate hook event/context shape on the target OpenClaw version.
3. Verify manual `/model` protection.
4. Verify subagent behavior independently from the parent model.
5. Compare routing decisions with the effective runtime model.
6. Run shadow mode against representative real workloads.
7. Enable controlled `auto` mode only after the gates pass.

See [`docs/implementation-plan.md`](docs/implementation-plan.md) and the executable [`router acceptance test protocol`](docs/acceptance-test-protocol.md).

## Security

Native OpenClaw plugins run inside the Gateway process. Review plugin code before installation and do not place credentials in this repository or its config examples. See [SECURITY.md](SECURITY.md).

## Contributing

Issues and focused pull requests are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) first.

## License

This project is MIT licensed. Router Core remains separately copyrighted by BlockRun and MIT licensed. See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
