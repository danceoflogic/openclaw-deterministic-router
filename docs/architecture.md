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

## Telemetry privacy

Normal audit records contain no raw prompt. Session keys are hashed. Classifier signals and scores can be logged without retaining conversation content.
