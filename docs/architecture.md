# Architecture

## Components

```text
OpenClaw turn
   │
   ▼
before_model_resolve
   │
   ├─ session/manual-selection guard
   │
   ▼
classifyLocally()
   │
   ├─ Router Core 15-dimension rules classifier
   └─ no LLM fallback
   │
   ▼
resolveTier()
   │
   ├─ ambiguity fallback
   └─ attachment floor
   │
   ▼
model policy
   │
   ├─ SIMPLE
   ├─ MEDIUM
   ├─ COMPLEX
   └─ REASONING
   │
   ▼
shadow log OR provider/model override
```

## Classification and policy are deliberately separate

The classifier answers: **how difficult does this turn appear?**

The policy answers: **which configured model should serve that tier?**

Changing provider economics should not require changing classifier weights. Conversely, tuning a classifier should not silently change provider configuration.

## Ambiguity

Router Core's rules classifier may return `tier: null` when confidence is below its threshold. This project does not call a second model to resolve ambiguity. Instead it uses the configured `ambiguousTier` deterministically. The default is `COMPLEX`, favouring capability over maximum savings.

## Manual model selection

OpenClaw's `before_model_resolve` context identifies sessions but does not expose a dedicated manual-override field. The plugin listens for the internal `session:patch` event for immediate updates, then reconciles the current session against the authoritative persisted entry from `api.runtime.agent.session.getSessionEntry({ sessionKey, agentId, readConsistency: "latest" })` before each routing decision. Only `providerOverride`/`modelOverride` are selection evidence; resolved `model` fields are not. A missing or ambiguous read removes stale in-memory state and fails AUTO closed.

This is intentionally isolated in `src/session-lock.ts` because it is the integration boundary most likely to need adaptation across OpenClaw versions.

## First-turn OpenClaw child authorization (merged PR #40)

An exact new child key is not known before `sessions_spawn`. The empty-by-default `autoSpawnParentGrants` authorizes a direct same-agent child of one verified, profile-created parent incarnation when immutable session identity, lineage and both safety guards agree. This does not grant general agent permissions or alter SHADOW as the default. Bounded TEST observed parent Sol, first-turn child Luna and parent continuation Luna independently at **agent-turn** scope, not at every upstream provider-request scope.

## Telemetry privacy

Normal audit records contain no raw prompt. Session keys are hashed. Classifier signals and scores can be logged without retaining conversation content.

## Architecture evolution (ADR 0002)

[ADR 0002: Routing boundaries and evaluation](decisions/0002-routing-boundaries-and-evaluation.md) records the **future design contract** for initial routing versus execution fallbacks, capability/authority checks versus workload suitability, optional agent-specific policies, and separately evidenced classification, application, runtime identity and answer quality. These are implementation directions, **not already-implemented components** in the diagram above. Bounded ordinary-turn AUTO and independent existing-/first-turn subagent routing have passed isolated TEST functional gates. Provider accounting, live lifecycle edges, performance, compatibility and production rollout remain separately gated.
