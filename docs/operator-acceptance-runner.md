# External operator TEST A/B runner (OpenClaw 2026.10.4)

This is the existing PR #38 external Ed25519 operator client, extended for deterministic evidence collection. It targets **only** `ws://127.0.0.1:19879` with profile `router-test`. It does not use agent-exec for operator RPCs, change production, or perform any inference except the two explicitly approved test prompts. The previous six-turn allowance is exhausted; a **new two-turn approval** is required for `run`.

## Private one-time setup

1. Install dependencies in this checkout. Ensure the isolated TEST Gateway is running and the candidate router is loaded. Keep the TEST journal readable by the operator's local account; the runner uses `journalctl --user -u openclaw-gateway-router-test.service` for existing router audits, without adding receipt infrastructure.
2. Create a private 0600 JSON settings file outside the repository:

   ```json
   {"gatewayUrl":"ws://127.0.0.1:19879","profile":"router-test","agentId":"main","ownerProfileId":"gateway-owner","maxTurns":2,"prompt":"Reply with one word: ready","deviceFile":"/PRIVATE/PATH/router-acceptance-device.json","reportFile":"/PRIVATE/PATH/router-acceptance-report.json"}
   ```

   The operator API discovers full TEST session keys via `sessions.list` and verifies both with `sessions.describe`. It filters for two human-profile-owned operator dashboard sessions matching `ownerProfileId`, excluding the `agent:main:main` root and rows without a profile actor. Both must be distinct, idle, and without an override. If discovery is ambiguous, put private `sessionA` and `sessionB` keys in this file; never paste them into chat or a PR. No synthetic records or bootstrap turns are created.
3. `npm run acceptance:operator -- validate /PRIVATE/PATH/settings.json` checks the file offline. `npm run acceptance:operator -- init-device /PRIVATE/PATH/settings.json` creates a private Ed25519 device identity. If an approved device already exists, use its file instead. Pair it once as an operator with `operator.read`, `operator.write`, and `operator.admin` on **TEST**: supply the TEST bootstrap token as `OPENCLAW_GATEWAY_TOKEN` only in the human-launched process environment, start a read-only `dry-run`, then inspect and approve its exact pending request with `openclaw --profile router-test devices list` and `openclaw --profile router-test devices approve <REQUEST_ID>`. Repeat `dry-run` after approval if the first connection timed out. The client stores the approved token beside the identity as a 0600 file and reuses it. Pairing is not an acceptance turn. Never use the unqualified production CLI for these steps.
4. `npm run acceptance:operator -- dry-run /PRIVATE/PATH/settings.json` connects read-only to TEST and checks guarded shadow, router SIMPLE target, explicit agent default, and eligible sessions. It performs zero config/session mutations and zero inference. A `READY` result is preparation, not functional acceptance.

## One-command bounded live run

After the owner approves a fresh two-turn window, launch the independently authorised operator process:

```sh
ROUTER_ACCEPTANCE_LIVE=YES ROUTER_ACCEPTANCE_APPROVED_TURNS=2 npm run acceptance:operator -- run /PRIVATE/PATH/settings.json
```

The runner captures original TEST router and agent settings in a private recovery file before any mutation. A begins with the **agent-specific default Luna** and a persisted user Sol selection; its AUTO decision must show `manualLock=true`, `applied=false`. Only if A passes does B run. B begins with the **agent-specific default Sol** and no user override; its SIMPLE AUTO decision must select Luna with `manualLock=false`, `applied=true`. An ignored default change blocks B, so a Luna-to-Luna result cannot pass.

Each turn gets one `chat.send`, no automatic inference retry. The runner correlates the exact run ID and first 16 characters of the session-key SHA-256 with the existing TEST journal audit, checks the decision and terminal chat event, and records OpenClaw's reported resolved model when available. Per-case results are `PASS`, `FAIL`, or `INCONCLUSIVE`; a completed turn alone is not PASS. The private JSON report includes run IDs, hashes, tier, selected model, lock/application states, completion, timestamps, and restoration. Provider-side model identity remains **deferred** to the owner's turn-level OpenAI accounting; router `applied=true` does not establish it.

In `finally`, the runner independently restores the original router mode/allowlist, original agent default, and its temporary A selection, then verifies configuration. A hard kill or a failed restoration leaves `<deviceFile>.restore.json` for recovery. Before any further test turn, run:

```sh
npm run acceptance:operator -- restore /PRIVATE/PATH/settings.json
```

`restore` uses the same authenticated TEST operator process, performs no inference, refuses to clear a changed A user selection or changed session generation, and verifies the saved config. If it fails, inspect TEST manually; never assume restoration from a failed command. After a verified normal run, the temporary recovery file is removed. No service restart, general AUTO rollout, merge, or Issue #8 acceptance is implied.
