# Issue #8 — independent child routing (TEST preparation)

Status: **prepared offline, not live-proven**. Production stays in guarded SHADOW. No Issue #8 inference has been sent.

## Installed OpenClaw 2026.10.4 contract

- Every embedded run without `modelSelectionLocked` enters `before_model_resolve` with that run's `runId`, `agentId`, and `sessionKey`. A native subagent is a separate run, so the child has its own hook invocation; live correlation remains to be observed.
- Native `sessions_spawn` mints `agent:<targetAgentId>:subagent:<uuid>`. For a same-agent spawn without `agentId`, the target is `main`; the child gets a new `sessionId`, `createdVia: "spawn"`, agent creation attribution, and `parentSessionKey`. Its initial model is an **automatic** inherited/configured starting selection (`modelOverrideSource: "auto"`), not a human manual choice.
- The plugin `subagent.allowModelOverride` / `allowedModels` trust policy controls plugin-owned subagent runtime API model-override requests. It does not gate the ordinary `before_model_resolve` hook return. Do not modify this policy for the test.
- The child UUID is not known before the initial child run. Neither the parent key nor lineage alone passes the router's exact-key AUTO allowlist. No wildcard or receipt bypass is proposed.

## Narrow fix and experiment

The router previously interpreted the child's complete persisted `auto` override as a manual lock. `src/session-lock.ts` now treats a **complete, valid** automatic override as clear; malformed or missing information remains unknown/fail-closed, and `user` overrides remain locked. The TEST Gateway must load this candidate before the live experiment.

The existing Gateway operator runner performs two separately restored phases:

1. From a pre-existing, human-owned, idle TEST dashboard session, set the TEST `main` default to Sol and allowlist **only the parent's exact hash**. Send one fixed, genuinely reasoning-heavy cache-consistency/proof task. It requests exactly one same-agent isolated child to read one README line. Require distinct parent/child run and session identities, parent Sol resolution, the child's separate non-applied decision, and the child's inherited Sol resolution. Restore the original agent default, SHADOW mode, and exact allowlist.
2. After verifying the child's generation, spawn attribution, parent key, idle state, and automatic selection, allowlist **only that child's exact hash**. Send the fixed SIMPLE, read-only follow-up: `Hi. What is the first line of README.md?` Require an applied child Luna decision and correlated OpenClaw runtime-model resolution. Restore SHADOW and the exact original allowlist.

The exact parent prompt classifies REASONING and the follow-up classifies SIMPLE under the pinned rules. The child bootstrap cannot safely be AUTO-authorised before its random key is known, so the follow-up is indispensable. This establishes **per-agent-turn / per-child-run routing**, not per-provider-call routing. Provider accounting remains separately deferred.

**Budget:** maximum **four actual inference turns**, counting the parent initial run, child bootstrap, potential parent continuation, and child follow-up. There is no retry after uncertain admission. The runner verifies at most three distinct parent-phase router run IDs before the follow-up; if more appear, it stops. The parent model itself may invoke internal provider calls, which are not separately counted as OpenClaw turns.

## Operator commands after separate live approval

Private settings: `/home/stduser/.openclaw-router-test/operator-acceptance-settings-child.json`. Both phases require the TEST Gateway to load the candidate build containing the automatic-selection fix. Confirm that deployment and a fresh read-only dry-run before spending any turn.

```bash
node scripts/acceptance/cli.mjs dry-run-child-parent /home/stduser/.openclaw-router-test/operator-acceptance-settings-child.json
ROUTER_ACCEPTANCE_LIVE=YES ROUTER_ACCEPTANCE_APPROVED_TURNS=4 node scripts/acceptance/cli.mjs run-child-parent /home/stduser/.openclaw-router-test/operator-acceptance-settings-child.json
node scripts/acceptance/cli.mjs dry-run-child-followup /home/stduser/.openclaw-router-test/operator-acceptance-settings-child.json
ROUTER_ACCEPTANCE_LIVE=YES ROUTER_ACCEPTANCE_APPROVED_TURNS=4 node scripts/acceptance/cli.mjs run-child-followup /home/stduser/.openclaw-router-test/operator-acceptance-settings-child.json
```

Only run the second live command if the first report and restoration are `PASS` and the follow-up dry-run is `READY`. If a recovery file remains, use the existing `restore` action and inspect the report before any further send. The live commands are documented, **not authorised by this file**.
