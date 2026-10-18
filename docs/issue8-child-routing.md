# Issue #8 — independent child routing (TEST acceptance)

Status: **two-phase TEST acceptance passed on 2026-10-18 at the OpenClaw agent-turn level**. The first approved attempt had used a native Codex `spawn_agent` child and was inconclusive. The corrected attempt used an actual OpenClaw `sessions_spawn` child, demonstrated an independently routed Luna follow-up, and restored TEST to its captured SHADOW configuration and prior build. It does not establish automatic Luna selection on the child's first turn or provider-request-level accounting.

## Installed OpenClaw 2026.10.4 contract

- Every embedded run without `modelSelectionLocked` enters `before_model_resolve` with that run's `runId`, `agentId`, and `sessionKey`. The observed OpenClaw child had its own hook invocation and independent run ID.
- Native `sessions_spawn` mints `agent:<targetAgentId>:subagent:<uuid>`. For a same-agent spawn without `agentId`, the target is `main`; the child gets a new `sessionId`, `createdVia: "spawn"`, agent creation attribution, and `parentSessionKey`. Its initial model is an **automatic** inherited/configured starting selection (`modelOverrideSource: "auto"`), not a human manual choice.
- The plugin `subagent.allowModelOverride` / `allowedModels` trust policy controls plugin-owned subagent runtime API model-override requests. It does not gate the ordinary `before_model_resolve` hook return. Do not modify this policy for the test.
- The Codex harness exposes both native `spawn_agent` and OpenClaw `sessions_spawn`. The prior generic delegation prompt selected a native Codex child, which has no `agent:main:subagent:<uuid>` Gateway session and cannot satisfy this test. The TEST parent's read-only `tools.effective` preview listed the core `sessions_spawn` tool, and sanitized Gateway `chat.history` subsequently confirmed an actual `sessions_spawn` tool call with `runtime="subagent"`, `context="isolated"`, no `agentId`, and no model override.
- The child UUID is not known before the initial child run. Neither the parent key nor lineage alone passes the router's exact-key AUTO allowlist. The child bootstrap must therefore remain non-applied on inherited Sol; no wildcard or receipt bypass is proposed. Only the later follow-up, after discovering and exactly allowlisting the existing child key, can demonstrate independent Luna routing. It does **not** prove automatic first-turn child selection.

## Narrow fix and experiment

The router previously interpreted the child's complete persisted `auto` override as a manual lock. `src/session-lock.ts` now treats a **complete, valid** automatic override as clear; malformed or missing information remains unknown/fail-closed, and `user` overrides remain locked. The TEST Gateway must load this candidate before the live experiment.

The existing Gateway operator runner performs two separately restored phases:

1. From a pre-existing, human-owned, idle TEST dashboard session, check the read-only effective-tool preview for `sessions_spawn`, set the TEST `main` default to Sol, and allowlist **only the parent's exact hash**. Send one fixed, genuinely reasoning-heavy cache-consistency/proof task. It explicitly requires the OpenClaw `sessions_spawn` tool with `runtime="subagent"`, `context="isolated"`, and **no `agentId`** (same TEST `main` agent), and forbids native Codex `spawn_agent` and any child model override. Require a genuine `agent:main:subagent:<uuid>` session with spawn provenance, distinct parent/child identities and run IDs, the child's `lastRunId` matching its independent router decision, parent Sol resolution, the child's separate non-applied decision, and the child's inherited Sol resolution. A native Codex child cannot count as PASS. Restore the original agent default, SHADOW mode, and exact allowlist.
2. After verifying the child's generation, spawn attribution, parent key, idle state, and automatic selection, allowlist **only that child's exact hash**. Send the fixed SIMPLE, read-only follow-up: `Hi. What is the first line of README.md?` Require an applied child Luna decision and correlated OpenClaw runtime-model resolution. Restore SHADOW and the exact original allowlist.

The exact parent prompt classifies REASONING and the follow-up classifies SIMPLE under the pinned rules. The child bootstrap cannot safely be AUTO-authorised before its random key is known, so the follow-up is indispensable. This establishes **per-agent-turn routing for an existing child session**, not automatic first-turn child selection or per-provider-call routing. Provider accounting remains separately deferred.

**Budget:** maximum **four actual inference turns**, counting the parent initial run, child bootstrap, potential parent continuation, and child follow-up. There is no retry after uncertain admission. The runner verifies at most three distinct parent-phase router run IDs before the follow-up; if more appear, it stops. The parent model itself may invoke internal provider calls, which are not separately counted as OpenClaw turns.

## Approved live TEST evidence (2026-10-18)

The parent and follow-up dry-runs were `READY`. Both live phases reported `PASS` with `restoration: PASS`; **three distinct OpenClaw inference turns** were consumed against the four-turn ceiling. Private reports are retained in the TEST profile as `issue8-child-report.child-parent.json` and `issue8-child-report.child-followup.json`.

| Turn | Independent run ID | Router decision | Applied | OpenClaw resolved model |
| --- | --- | --- | --- | --- |
| Parent | `349ace6f-7bc6-434a-a5a7-80daeeed55ac` | REASONING → Sol | Yes | `openai/gpt-6-sol` |
| Child bootstrap | `90244c1f-c279-4941-a506-a519d1f84552` | MEDIUM → Luna | No: new child key was not yet exact-allowlisted | Inherited `openai/gpt-6-sol` |
| Existing-child follow-up | `8ad14d61-c764-4c63-bff0-aadb522437f7` | SIMPLE → Luna | Yes | `openai/gpt-6-luna` |

The child was a distinct `agent:main:subagent:<uuid>` session with `createdVia: "spawn"`, agent creation attribution, the expected parent session key, and `lastRunId` matching its bootstrap router decision. The parent transcript's actual tool-call receipt confirmed OpenClaw `sessions_spawn`; no native Codex child was counted. The follow-up used the same child session and a different run ID. No plugin subagent model-override permission or wildcard allowlist was needed. The resolved models above are OpenClaw turn-scoped observations; **provider-level request verification remains deferred**.

After the run, the prior TEST `dist/index.js` and `openclaw.json` hashes matched the captured baseline. A fresh read-only Gateway check returned healthy, SHADOW, zero AUTO-allowlisted keys, `protectManualSelection: true`, and `requireSessionKeyForAuto: true`. Production was not changed and PR #40 remains unmerged.

## Operator commands (historical; a new attempt requires separate approval)

Private settings: `/home/stduser/.openclaw-router-test/operator-acceptance-settings-child.json`. Both phases require the TEST Gateway to load the candidate build containing the automatic-selection fix. Confirm that deployment and a fresh read-only dry-run before spending any turn.

Before another separately approved live attempt, ensure that private settings file's exact `parentPrompt` matches this revision's `ISSUE8_PARENT_PROMPT`; the runner rejects the old generic prompt. Do not interpret a `tools.effective` preview as an exact active-run tool receipt. If the intended OpenClaw child is absent, stop without retrying inference; any native Codex child still consumes inference even though it cannot satisfy this Gateway-child gate.

```bash
node scripts/acceptance/cli.mjs dry-run-child-parent /home/stduser/.openclaw-router-test/operator-acceptance-settings-child.json
ROUTER_ACCEPTANCE_LIVE=YES ROUTER_ACCEPTANCE_APPROVED_TURNS=4 node scripts/acceptance/cli.mjs run-child-parent /home/stduser/.openclaw-router-test/operator-acceptance-settings-child.json
node scripts/acceptance/cli.mjs dry-run-child-followup /home/stduser/.openclaw-router-test/operator-acceptance-settings-child.json
ROUTER_ACCEPTANCE_LIVE=YES ROUTER_ACCEPTANCE_APPROVED_TURNS=4 node scripts/acceptance/cli.mjs run-child-followup /home/stduser/.openclaw-router-test/operator-acceptance-settings-child.json
```

Only run the second live command if the first report and restoration are `PASS` and the follow-up dry-run is `READY`. If a recovery file remains, use the existing `restore` action and inspect the report before any further send. The live commands are documented, **not authorised by this file**.
